/**
 * Stateless MCP server factory.
 *
 * Creates a new McpServer instance per-request (CVE GHSA-qgp8-v765-qxx9).
 * Mirrors the knowledge-server createMcpServer pattern exactly.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTools } from './tools';
import { registerResources } from './resources';
import { registerPrompts } from './prompts';

export function createMcpServer(env: Env): McpServer {
  const server = new McpServer({
    name: 'superbenefit-governance',
    version: '1.0.0',
  });

  registerTools(server, env);
  registerResources(server, env);
  registerPrompts(server, env);

  return server;
}
