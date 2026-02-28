/**
 * MCP tools: Hats roles.
 * Tier: Open.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveAuthContext } from '../../auth/resolve';
import { requireTier } from '../../auth/check';
import { fetchRoles, fetchRoleDetail } from '../../data/sources/hats';

export function registerRoleTools(server: McpServer, env: Env): void {
  server.tool(
    'list_roles',
    'Returns the full Hats Protocol role tree for SuperBenefit, including all hats with wearer counts.',
    {},
    async (_args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const roles = await fetchRoles(env);
      return { content: [{ type: 'text', text: JSON.stringify(roles, null, 2) }] };
    },
  );

  server.tool(
    'get_role',
    'Returns detail for a specific Hats hat, including current wearers.',
    {
      hatId: z.string().describe('The numeric or hex hat ID from the Hats tree'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const role = await fetchRoleDetail(args.hatId, env);
      if (!role) {
        return { content: [{ type: 'text', text: `Hat ${args.hatId} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(role, null, 2) }] };
    },
  );
}
