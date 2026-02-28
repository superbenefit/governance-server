/**
 * ENS data source — identity and profile resolution.
 *
 * Resolves ENS reverse records and text records for Ethereum addresses.
 * Used for both DAO identity (superbenefit.eth) and member profiles.
 *
 * Uses Cloudflare Web3 gateway as the JSON-RPC provider — no third-party keys needed.
 * Profiles cached in KV under 'ens:profiles' with 24h TTL.
 */

export interface EnsProfile {
  ensName?: string;
  avatar?: string;
  url?: string;
  description?: string;
  twitter?: string;
  github?: string;
}

export interface DaoIdentity {
  name: string;
  description?: string;
  avatar?: string;
  url?: string;
  daoURI?: string;
}

// ENS public resolver address on mainnet
const ENS_UNIVERSAL_RESOLVER = '0xce01f8eee7E479C928F8919abD53E553a36CeF67';

/**
 * Resolve ENS profiles for a list of addresses.
 * Returns a map of lowercased address → profile.
 */
export async function resolveEnsProfiles(
  addresses: string[],
  env: Env,
): Promise<Record<string, EnsProfile>> {
  // Check cached profiles
  const cached = await env.GOVERNANCE_CACHE.get('ens:profiles');
  const profiles: Record<string, EnsProfile> = cached ? JSON.parse(cached) : {};

  // Only fetch addresses not already cached
  const missing = addresses.filter((a) => !(a.toLowerCase() in profiles));

  if (missing.length > 0) {
    const fetched = await fetchProfilesBatch(missing, env);
    Object.assign(profiles, fetched);
    await env.GOVERNANCE_CACHE.put('ens:profiles', JSON.stringify(profiles), {
      expirationTtl: 24 * 60 * 60,
    });
  }

  return profiles;
}

/**
 * Resolve the DAO's identity from its ENS name.
 * Reads name, description, avatar, url, and daoURI text records.
 */
export async function resolveDaoIdentity(env: Env): Promise<DaoIdentity> {
  const ensName = env.SB_ENS_NAME;
  if (!ensName) return { name: 'SuperBenefit' };

  try {
    const node = namehash(ensName);
    const [name, description, avatar, url, daoURI] = await Promise.all([
      readTextRecord(node, 'name', env),
      readTextRecord(node, 'description', env),
      readTextRecord(node, 'avatar', env),
      readTextRecord(node, 'url', env),
      readTextRecord(node, 'daoURI', env),
    ]);

    return {
      name: name ?? 'SuperBenefit',
      description: description ?? undefined,
      avatar: avatar ?? undefined,
      url: url ?? undefined,
      daoURI: daoURI ?? undefined,
    };
  } catch (err) {
    console.error('ENS DAO identity resolution failed:', err);
    return { name: 'SuperBenefit' };
  }
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

async function fetchProfilesBatch(
  addresses: string[],
  env: Env,
): Promise<Record<string, EnsProfile>> {
  const results: Record<string, EnsProfile> = {};

  // Resolve in parallel with a concurrency limit to avoid hammering the RPC
  const CHUNK = 5;
  for (let i = 0; i < addresses.length; i += CHUNK) {
    const chunk = addresses.slice(i, i + CHUNK);
    const settled = await Promise.allSettled(chunk.map((addr) => resolveAddress(addr, env)));
    settled.forEach((result, idx) => {
      const addr = chunk[idx].toLowerCase();
      if (result.status === 'fulfilled') {
        results[addr] = result.value;
      } else {
        results[addr] = {}; // no profile found
      }
    });
  }

  return results;
}

async function resolveAddress(address: string, env: Env): Promise<EnsProfile> {
  // ENS reverse resolution: <addr>.addr.reverse
  const reverseNode = namehash(`${address.slice(2).toLowerCase()}.addr.reverse`);
  const name = await resolveReverseName(reverseNode, env);
  if (!name) return {};

  const forwardNode = namehash(name);
  const [avatar, url, description, twitter, github] = await Promise.all([
    readTextRecord(forwardNode, 'avatar', env),
    readTextRecord(forwardNode, 'url', env),
    readTextRecord(forwardNode, 'description', env),
    readTextRecord(forwardNode, 'com.twitter', env),
    readTextRecord(forwardNode, 'com.github', env),
  ]);

  return {
    ensName: name,
    avatar: avatar ?? undefined,
    url: url ?? undefined,
    description: description ?? undefined,
    twitter: twitter ?? undefined,
    github: github ?? undefined,
  };
}

async function resolveReverseName(node: string, env: Env): Promise<string | null> {
  // Call ENS UniversalResolver.reverse(bytes)
  // Simplified: use eth_call with the public resolver
  try {
    const result = await ethCall(env, ENS_UNIVERSAL_RESOLVER, encodeName(node));
    return result ? decodeString(result) : null;
  } catch {
    return null;
  }
}

async function readTextRecord(node: string, key: string, env: Env): Promise<string | null> {
  // ABI: text(bytes32 node, string key) → string
  try {
    const selector = '0x59d1d43c';
    const encodedCall = selector + node.slice(2).padStart(64, '0') + encodeString(key);
    const result = await ethCall(env, ENS_UNIVERSAL_RESOLVER, encodedCall);
    return result ? decodeString(result) : null;
  } catch {
    return null;
  }
}

async function ethCall(env: Env, to: string, data: string): Promise<string | null> {
  const response = await fetch(env.ETH_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'eth_call',
      params: [{ to, data }, 'latest'],
    }),
  });

  const json = await response.json() as { result?: string; error?: unknown };
  if (json.error || !json.result || json.result === '0x') return null;
  return json.result;
}

// Minimal ABI encoding helpers
function namehash(name: string): string {
  let node = '0x' + '00'.repeat(32);
  if (name === '') return node;
  const labels = name.split('.').reverse();
  for (const label of labels) {
    const labelHash = keccak256(new TextEncoder().encode(label));
    const combined = new Uint8Array(64);
    combined.set(hexToBytes(node.slice(2)), 0);
    combined.set(hexToBytes(labelHash), 32);
    node = '0x' + bytesToHex(keccak256Bytes(combined));
  }
  return node;
}

function encodeString(s: string): string {
  const bytes = new TextEncoder().encode(s);
  const offset = '0000000000000000000000000000000000000000000000000000000000000020';
  const length = bytes.length.toString(16).padStart(64, '0');
  const padded = bytesToHex(bytes).padEnd(Math.ceil(bytes.length / 32) * 64, '0');
  return offset + length + padded;
}

function decodeString(hex: string): string | null {
  try {
    const data = hex.startsWith('0x') ? hex.slice(2) : hex;
    const offset = parseInt(data.slice(0, 64), 16) * 2;
    const length = parseInt(data.slice(offset, offset + 64), 16);
    const strHex = data.slice(offset + 64, offset + 64 + length * 2);
    return new TextDecoder().decode(hexToBytes(strHex)) || null;
  } catch {
    return null;
  }
}

function encodeName(node: string): string {
  return '0x' + node.slice(2).padStart(64, '0');
}

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
  }
  return bytes;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes).map((b) => b.toString(16).padStart(2, '0')).join('');
}

// NOTE: These are placeholder implementations.
// In production, use @noble/hashes or Web Crypto for keccak256.
// Cloudflare Workers support the SubtleCrypto API but not keccak256 natively.
// Recommended: import { keccak_256 } from '@noble/hashes/sha3'
function keccak256(_data: Uint8Array): string {
  // TODO: replace with @noble/hashes keccak256
  throw new Error('keccak256 not implemented — install @noble/hashes and replace this function');
}

function keccak256Bytes(_data: Uint8Array): Uint8Array {
  throw new Error('keccak256 not implemented — install @noble/hashes and replace this function');
}
