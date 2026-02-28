/**
 * SPRB token data source — membership via ERC-20 holder enumeration.
 *
 * SuperBenefit has ~20-25 members, so direct RPC is viable without an indexer.
 * Strategy: fetch Transfer events from the contract to build the current holder set.
 *
 * OPEN QUESTION: SPRB_CONTRACT_ADDRESS must be confirmed and set in wrangler.jsonc vars.
 *
 * Uses Cloudflare Web3 gateway (ETH_RPC_URL) — no third-party API keys required.
 */

import { resolveEnsProfiles } from './ens';

export interface Member {
  /** CAIP-10 address: eip155:1:<address> */
  id: string;
  address: string;
  ensName?: string;
  avatar?: string;
  url?: string;
  description?: string;
}

export interface MembersPayload {
  '@context': string;
  '@type': string;
  members: Member[];
}

/**
 * Fetch current SPRB holders via eth_getLogs (Transfer events).
 * Returns deduplicated set of addresses with non-zero balance.
 */
export async function fetchMembers(env: Env, params?: { role?: string; group?: string }): Promise<Member[]> {
  const cached = await env.GOVERNANCE_CACHE.get('daoip2:members');
  let members: Member[];

  if (cached) {
    const payload = JSON.parse(cached) as MembersPayload;
    members = payload.members ?? [];
  } else {
    members = await fetchHoldersFromChain(env);
    await env.GOVERNANCE_CACHE.put('daoip2:members', JSON.stringify({ members }), { expirationTtl: 30 * 60 });
  }

  // TODO: filter by role (cross-reference with Hats) or group (cross-reference with groups)
  // These filters require joining member addresses against the roles/groups data.
  // Implement in Phase 1.5 after core endpoints are confirmed working.
  return members;
}

export async function fetchMemberDetail(addressOrEns: string, env: Env): Promise<Member | null> {
  const members = await fetchMembers(env);
  const normalised = addressOrEns.toLowerCase();
  return members.find(
    (m) => m.address.toLowerCase() === normalised || m.ensName?.toLowerCase() === normalised
  ) ?? null;
}

/**
 * Build the full DAOIP-2 members JSON-LD payload.
 * Called by the KV cache refresh and the /api/v1/members route.
 */
export async function buildMembersPayload(env: Env): Promise<MembersPayload> {
  const holders = await fetchHoldersFromChain(env);
  return {
    '@context': 'http://www.daostar.org/schemas',
    '@type': 'DAO',
    members: holders,
  };
}

async function fetchHoldersFromChain(env: Env): Promise<Member[]> {
  const contractAddress = env.SPRB_CONTRACT_ADDRESS;
  if (!contractAddress) {
    console.warn('SPRB_CONTRACT_ADDRESS not configured — returning empty member list');
    return [];
  }

  // ERC-20 Transfer event topic
  const transferTopic = '0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';

  // Fetch all Transfer events to/from the contract
  const logsResponse = await ethRpc(env, 'eth_getLogs', [{
    address: contractAddress,
    topics: [transferTopic],
    fromBlock: '0x0',
    toBlock: 'latest',
  }]);

  if (!Array.isArray(logsResponse)) {
    throw new Error('Unexpected eth_getLogs response');
  }

  // Parse Transfer events and compute current holder set
  const balances = new Map<string, bigint>();
  for (const log of logsResponse) {
    const from = '0x' + log.topics[1].slice(26);
    const to = '0x' + log.topics[2].slice(26);
    const value = BigInt(log.data);

    balances.set(from, (balances.get(from) ?? 0n) - value);
    balances.set(to, (balances.get(to) ?? 0n) + value);
  }

  // Filter to addresses with positive balance, exclude zero address
  const zeroAddress = '0x0000000000000000000000000000000000000000';
  const holders = [...balances.entries()]
    .filter(([addr, bal]) => bal > 0n && addr !== zeroAddress)
    .map(([addr]) => addr);

  // Resolve ENS profiles in parallel
  const profiles = await resolveEnsProfiles(holders, env);

  return holders.map((address) => {
    const profile = profiles[address.toLowerCase()] ?? {};
    return {
      id: `eip155:1:${address}`,
      address,
      ...profile,
    };
  });
}

async function ethRpc(env: Env, method: string, params: unknown[]): Promise<unknown> {
  const response = await fetch(env.ETH_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });

  if (!response.ok) {
    throw new Error(`ETH RPC error: ${response.status}`);
  }

  const json = await response.json() as { result?: unknown; error?: { message: string } };
  if (json.error) throw new Error(`ETH RPC: ${json.error.message}`);
  return json.result;
}
