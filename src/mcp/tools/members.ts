/**
 * MCP tools: membership queries.
 * Tier: Open.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveAuthContext } from '../../auth/resolve';
import { requireTier } from '../../auth/check';
import { fetchMembers } from '../../data/sources/sprb';

export function registerMemberTools(server: McpServer, env: Env): void {
  server.tool(
    'list_members',
    'Returns DAO members (SPRB token holders) with optional filtering by role or group.',
    {
      role: z.string().optional().describe('Filter by Hats hat ID'),
      group: z.string().optional().describe('Filter by group/cell slug'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const members = await fetchMembers(env, args);
      return {
        content: [{ type: 'text', text: JSON.stringify(members, null, 2) }],
      };
    },
  );

  server.tool(
    'get_member',
    'Returns the profile for a specific address — roles held, groups, ENS name, and hat history.',
    {
      address: z.string().describe('Ethereum address (0x...) or ENS name'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const { fetchMemberDetail } = await import('../../data/sources/sprb');
      const member = await fetchMemberDetail(args.address, env);
      if (!member) {
        return { content: [{ type: 'text', text: 'Member not found' }], isError: true };
      }
      return {
        content: [{ type: 'text', text: JSON.stringify(member, null, 2) }],
      };
    },
  );
}
