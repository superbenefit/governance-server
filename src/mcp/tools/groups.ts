/**
 * MCP tools: groups/cells.
 * Tier: Open.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveAuthContext } from '../../auth/resolve';
import { requireTier } from '../../auth/check';
import { fetchGroups } from '../../data/sources/groups';

export function registerGroupTools(server: McpServer, env: Env): void {
  server.tool(
    'list_groups',
    'Returns all active Cells and working groups in SuperBenefit.',
    {},
    async (_args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const groups = await fetchGroups(env);
      return { content: [{ type: 'text', text: JSON.stringify(groups, null, 2) }] };
    },
  );

  server.tool(
    'get_group',
    'Returns detail for a specific group/cell, including linked hats and current members.',
    {
      id: z.string().describe('Group slug or ID'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const groups = await fetchGroups(env, { id: args.id });
      const group = groups[0] ?? null;
      if (!group) {
        return { content: [{ type: 'text', text: `Group ${args.id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(group, null, 2) }] };
    },
  );
}
