/**
 * MCP tools: Snapshot proposals and activity log.
 * Tier: Open.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';
import { resolveAuthContext } from '../../auth/resolve';
import { requireTier } from '../../auth/check';
import { fetchProposals, fetchProposalDetail, fetchActivity } from '../../data/sources/snapshot';

export function registerProposalTools(server: McpServer, env: Env): void {
  server.tool(
    'list_proposals',
    'Returns Snapshot proposals for SuperBenefit with optional status and type filters.',
    {
      status: z.enum(['active', 'closed', 'pending']).optional().describe('Filter by proposal status'),
      type: z.string().optional().describe('Filter by DAOIP-4 proposal type'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const proposals = await fetchProposals(env, args);
      return { content: [{ type: 'text', text: JSON.stringify(proposals, null, 2) }] };
    },
  );

  server.tool(
    'get_proposal',
    'Returns detail for a specific Snapshot proposal including vote summary and discussion link.',
    {
      id: z.string().describe('Snapshot proposal ID'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const proposal = await fetchProposalDetail(args.id, env);
      if (!proposal) {
        return { content: [{ type: 'text', text: `Proposal ${args.id} not found` }], isError: true };
      }
      return { content: [{ type: 'text', text: JSON.stringify(proposal, null, 2) }] };
    },
  );

  server.tool(
    'list_activity',
    'Returns the DAO activity log (proposal events) with optional member or proposal filters.',
    {
      member: z.string().optional().describe('Filter by member address'),
      proposalId: z.string().optional().describe('Filter by proposal ID'),
    },
    async (args, { meta }) => {
      const auth = await resolveAuthContext(meta?.request as Request, env);
      requireTier(auth, 'open');

      const activity = await fetchActivity(env, args);
      return { content: [{ type: 'text', text: JSON.stringify(activity, null, 2) }] };
    },
  );
}
