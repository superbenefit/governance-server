/**
 * Hats Protocol data source.
 *
 * Queries the Hats subgraph on Ethereum mainnet for the SuperBenefit tree.
 * Results are cached in KV under 'sb:roles'.
 *
 * OPEN QUESTION: Mainnet subgraph endpoint and HATS_TREE_ID must be confirmed.
 * Fallback: Hats Protocol REST API at api.hatsprotocol.xyz if subgraph is unreliable.
 */

const HATS_SUBGRAPH_URL = 'https://api.goldsky.com/api/public/project_clp9ilfbtmxor01wv9ipedty5/subgraphs/hats-mainnet/1.0.0/gn';

const HATS_TREE_QUERY = `
  query GetTree($treeId: ID!) {
    tree(id: $treeId) {
      id
      hats {
        id
        prettyId
        details
        imageUri
        eligibility
        toggle
        maxSupply
        currentSupply
        wearers {
          id
        }
        subHats {
          id
          prettyId
          details
          currentSupply
          wearers {
            id
          }
        }
      }
    }
  }
`;

export interface HatWearer {
  address: string;
  ensName?: string;
}

export interface Hat {
  id: string;
  prettyId: string;
  details: string;
  imageUri?: string;
  maxSupply: string;
  currentSupply: string;
  wearers: HatWearer[];
  subHats?: Hat[];
}

export interface HatsTree {
  id: string;
  hats: Hat[];
}

export async function fetchRoles(env: Env, params?: { hatId?: string }): Promise<Hat[] | Hat | null> {
  // Check KV cache first
  const cached = await env.GOVERNANCE_CACHE.get('sb:roles');
  let tree: Hat[] | null = null;

  if (cached) {
    tree = JSON.parse(cached);
  } else {
    tree = await fetchFromSubgraph(env);
    if (tree) {
      await env.GOVERNANCE_CACHE.put('sb:roles', JSON.stringify(tree), { expirationTtl: 30 * 60 });
    }
  }

  if (!tree) return params?.hatId ? null : [];

  if (params?.hatId) {
    return findHat(tree, params.hatId) ?? null;
  }
  return tree;
}

export async function fetchRoleDetail(hatId: string, env: Env): Promise<Hat | null> {
  const roles = await fetchRoles(env);
  if (!Array.isArray(roles)) return null;
  return findHat(roles, hatId) ?? null;
}

async function fetchFromSubgraph(env: Env): Promise<Hat[] | null> {
  const treeId = env.HATS_TREE_ID;
  if (!treeId) {
    console.warn('HATS_TREE_ID not configured');
    return null;
  }

  const response = await fetch(HATS_SUBGRAPH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ query: HATS_TREE_QUERY, variables: { treeId } }),
  });

  if (!response.ok) {
    throw new Error(`Hats subgraph error: ${response.status}`);
  }

  const data = await response.json() as { data?: { tree?: HatsTree }; errors?: unknown[] };

  if (data.errors?.length) {
    throw new Error(`Hats subgraph GraphQL error: ${JSON.stringify(data.errors)}`);
  }

  return data.data?.tree?.hats ?? null;
}

function findHat(hats: Hat[], hatId: string): Hat | undefined {
  for (const hat of hats) {
    if (hat.id === hatId || hat.prettyId === hatId) return hat;
    if (hat.subHats) {
      const found = findHat(hat.subHats, hatId);
      if (found) return found;
    }
  }
  return undefined;
}
