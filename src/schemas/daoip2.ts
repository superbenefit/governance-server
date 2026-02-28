/**
 * DAOIP-2 schema builders.
 * Assembles the top-level DAO descriptor with all sub-schemas embedded.
 *
 * Spec: https://github.com/metagov/daostar/blob/main/DAOIPs/daoip-2.md
 */

import { resolveDaoIdentity } from '../data/sources/ens';
import { fetchMembers } from '../data/sources/sprb';
import { fetchProposals } from '../data/sources/snapshot';

export async function buildDaoDescriptor(env: Env): Promise<Record<string, unknown>> {
  const [identity, members, proposals] = await Promise.all([
    resolveDaoIdentity(env),
    fetchMembers(env),
    fetchProposals(env, {}),
  ]);

  const baseUrl = `https://${env.SB_ENS_NAME ? 'governance.superbenefit.dev' : 'governance.superbenefit.dev'}`;

  return {
    '@context': 'http://www.daostar.org/schemas',
    '@type': 'DAO',
    name: identity.name,
    description: identity.description,
    avatarURI: identity.avatar,
    governanceURI: `${baseUrl}/api/v1/governance`,
    activityLogURI: `${baseUrl}/api/v1/activity`,

    // Embedded sub-schemas (DAOIP-2 allows embedding rather than URI references)
    members: {
      '@context': 'http://www.daostar.org/schemas',
      '@type': 'DAO',
      members: members.map((m) => ({
        '@type': 'EthereumAddress',
        id: m.id,               // CAIP-10: eip155:1:<address>
        name: m.ensName,
      })),
    },

    proposals: {
      '@context': 'http://www.daostar.org/schemas',
      '@type': 'DAO',
      proposals: proposals.slice(0, 20), // Most recent 20 for the descriptor
    },

    // Contracts — sourced from static config (addresses confirmed separately)
    contracts: buildContracts(env),

    // Extension: roles and groups (SB-specific, not DAOIP-2 standard)
    rolesURI: `${baseUrl}/api/v1/roles`,
    groupsURI: `${baseUrl}/api/v1/groups`,
    agreementsURI: `${baseUrl}/api/v1/agreements`,
    policiesURI: `${baseUrl}/api/v1/policies`,
  };
}

function buildContracts(env: Env): Record<string, unknown> {
  const contracts: Array<{ '@type': string; id: string; name: string; chain: string }> = [];

  if (env.SPRB_CONTRACT_ADDRESS) {
    contracts.push({
      '@type': 'EthereumAddress',
      id: `eip155:1:${env.SPRB_CONTRACT_ADDRESS}`,
      name: 'SPRB Token',
      chain: 'eip155:1',
    });
  }

  return {
    '@context': 'http://www.daostar.org/schemas',
    '@type': 'DAO',
    contracts,
  };
}
