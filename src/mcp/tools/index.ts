/**
 * Tool registration — called once per McpServer instance.
 * Add one line here when a new tool file is created.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDaoTools } from './dao';
import { registerMemberTools } from './members';
import { registerRoleTools } from './roles';
import { registerGroupTools } from './groups';
import { registerProposalTools } from './proposals';
import { registerAgreementTools } from './agreements';
import { registerPolicyTools } from './policies';

export function registerTools(server: McpServer, env: Env): void {
  registerDaoTools(server, env);
  registerMemberTools(server, env);
  registerRoleTools(server, env);
  registerGroupTools(server, env);
  registerProposalTools(server, env);
  registerAgreementTools(server, env);
  registerPolicyTools(server, env);
}
