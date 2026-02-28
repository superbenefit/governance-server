/**
 * MCP tools: agreements (from D1).
 * Tier: Open.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveAuthContext } from '../../auth/resolve';
import { requireTier } from '../../auth/check';
import { queryAgreements, queryAgreementDetail } from '../../data/db';

export function registerAgreementTools(server: McpServer, env: Env): void {
  server.tool(
    'list_agreements',
    'Returns all SuperBenefit agreements with optional domain filter.',
    {
      domain: z.string().optional().describe('Domain slug to filter by'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const agreements = await queryAgreements(env.GOVERNANCE_DB, args);
      return { content: [{ type: 'text', text: JSON.stringify(agreements, null, 2) }] };
    },
  );

  server.tool(
    'get_agreement',
    'Returns detail for a specific agreement, including its related policies and governance domain.',
    {
      id: z.string().describe('Agreement slug or ID'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const agreement = await queryAgreementDetail(env.GOVERNANCE_DB, args.id);
      if (!agreement) {
        return { content: [{ type: 'text', text: `Agreement ${args.id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(agreement, null, 2) }] };
    },
  );
}
