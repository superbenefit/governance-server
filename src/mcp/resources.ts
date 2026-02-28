/**
 * MCP Resources — application-controlled context that an MCP host can inject
 * into a conversation without a tool call.
 */

import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { getDaoDescriptor, getCachedValue } from '../data/kv-cache';
import { queryAgreements, queryPolicies } from '../data/db';

export function registerResources(server: McpServer, env: Env): void {
  server.resource('governance://dao', 'DAOIP-2 top-level descriptor for SuperBenefit DAO', async () => {
    const dao = await getDaoDescriptor(env);
    return { contents: [{ uri: 'governance://dao', mimeType: 'application/json', text: JSON.stringify(dao, null, 2) }] };
  });

  server.resource('governance://members', 'Current SPRB token holders with ENS profiles', async () => {
    const members = await getCachedValue(env, 'daoip2:members');
    return { contents: [{ uri: 'governance://members', mimeType: 'application/json', text: members ?? '[]' }] };
  });

  server.resource('governance://roles', 'Full Hats Protocol role tree', async () => {
    const roles = await getCachedValue(env, 'sb:roles');
    return { contents: [{ uri: 'governance://roles', mimeType: 'application/json', text: roles ?? '[]' }] };
  });

  server.resource('governance://groups', 'All active groups and cells', async () => {
    const groups = await getCachedValue(env, 'sb:groups');
    return { contents: [{ uri: 'governance://groups', mimeType: 'application/json', text: groups ?? '[]' }] };
  });

  server.resource('governance://agreements', 'All agreements with domain structure', async () => {
    const agreements = await queryAgreements(env.GOVERNANCE_DB, {});
    return { contents: [{ uri: 'governance://agreements', mimeType: 'application/json', text: JSON.stringify(agreements, null, 2) }] };
  });

  server.resource('governance://policies', 'All policies with domain structure', async () => {
    const policies = await queryPolicies(env.GOVERNANCE_DB, {});
    return { contents: [{ uri: 'governance://policies', mimeType: 'application/json', text: JSON.stringify(policies, null, 2) }] };
  });

  server.resource('governance://context', 'Synthesised model context from governance repo index and readme files', async () => {
    // TODO: fetch index/readme files from R2 and synthesise
    const placeholder = 'SuperBenefit DAO governance context — index and readme synthesis pending implementation.';
    return { contents: [{ uri: 'governance://context', mimeType: 'text/plain', text: placeholder }] };
  });
}
