/**
 * MCP tools: DAO-level info (DAOIP-2 top-level descriptor).
 * Tier: Open (Phase 1 — all tools are open tier).
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveAuthContext } from '../../auth/resolve';
import { requireTier } from '../../auth/check';
import { getDaoDescriptor } from '../../data/kv-cache';

export function registerDaoTools(server: McpServer, env: Env): void {
  server.tool(
    'get_dao_info',
    'Returns the full DAOIP-2 descriptor for SuperBenefit DAO, including identity, members, proposals, roles, groups, agreements, and contracts.',
    {},
    async (_args, { signal: _signal, meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const dao = await getDaoDescriptor(env);
      return {
        content: [{ type: 'text', text: JSON.stringify(dao, null, 2) }],
      };
    },
  );
}
