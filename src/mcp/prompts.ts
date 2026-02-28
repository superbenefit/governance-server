/**
 * MCP Prompts — user-controlled workflow templates that guide an AI agent
 * through structured governance queries.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { z } from 'zod';

export function registerPrompts(server: McpServer, _env: Env): void {
  server.prompt(
    'summarise_governance',
    'Structured overview of SuperBenefit\'s current governance state — active roles, recent proposals, key agreements.',
    {},
    async () => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please provide a structured overview of SuperBenefit's current governance state.

Use the following tools in order:
1. get_dao_info — for top-level DAO identity and structure
2. list_roles — for current role hierarchy
3. list_groups — for active cells and working groups
4. list_proposals — with status "active" to see live proposals
5. list_agreements — for foundational agreements
6. list_policies — for operational policies

Summarise: who governs what, what is currently being decided, and what agreements and policies are in effect.`,
          },
        },
      ],
    }),
  );

  server.prompt(
    'find_role_holders',
    'Identify who currently holds a named role in SuperBenefit.',
    {
      roleName: z.string().describe('The name or description of the role to look up'),
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Find who currently holds the role "${args.roleName}" in SuperBenefit.

1. Use list_roles to browse the full Hats tree
2. Find the hat that matches "${args.roleName}" (by name or description)
3. Use get_role with the matching hat ID to get current wearers
4. For each wearer address, use get_member to get their ENS profile

Return: the hat details, current holders with their names/addresses, and any relevant context about the role.`,
          },
        },
      ],
    }),
  );

  server.prompt(
    'proposal_context',
    'Load full context for a named proposal including discussion, vote summary, and related governance documents.',
    {
      proposalName: z.string().describe('The name or partial title of the proposal'),
    },
    async (args) => ({
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Load full context for the proposal "${args.proposalName}".

1. Use list_proposals to find the proposal matching "${args.proposalName}"
2. Use get_proposal with the matching ID for full detail including vote summary and discussion link
3. If the proposal enacted an agreement or policy, use get_agreement or get_policy to show what was created
4. Use list_activity filtered by the proposal ID to show related activity

Summarise: what was proposed, the vote outcome, and any governance documents it created or modified.`,
          },
        },
      ],
    }),
  );
}
