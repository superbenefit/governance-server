/**
 * MCP tools: policies (from D1).
 * Tier: Open.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveAuthContext } from '../../auth/resolve';
import { requireTier } from '../../auth/check';
import { queryPolicies, queryPolicyDetail } from '../../data/db';

export function registerPolicyTools(server: McpServer, env: Env): void {
  server.tool(
    'list_policies',
    'Returns all SuperBenefit policies with optional domain filter.',
    {
      domain: z.string().optional().describe('Domain slug to filter by'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const policies = await queryPolicies(env.GOVERNANCE_DB, args);
      return { content: [{ type: 'text', text: JSON.stringify(policies, null, 2) }] };
    },
  );

  server.tool(
    'get_policy',
    'Returns detail for a specific policy, including the agreement that authorises it.',
    {
      id: z.string().describe('Policy slug or ID'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const policy = await queryPolicyDetail(env.GOVERNANCE_DB, args.id);
      if (!policy) {
        return { content: [{ type: 'text', text: `Policy ${args.id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(policy, null, 2) }] };
    },
  );
}
