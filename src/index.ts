/**
 * Main entry point for the SuperBenefit Governance Server.
 *
 * Extends WorkerEntrypoint to provide:
 * - HTTP routing: /dao.json, /api/v1/*, /mcp, /webhook, /internal/*
 * - Cron trigger for KV cache refresh (Hats, SPRB, Snapshot, ENS)
 * - RPC methods for inter-Worker service binding calls
 *
 * Phase 1: No authentication. All endpoints are Open tier.
 * Phase 2: Add Access JWT parsing for Public tier (member detail).
 * Phase 3: SPRB token ownership check for Members tier.
 *
 * Mirrors the knowledge-server entry point conventions exactly.
 */

import { WorkerEntrypoint } from 'cloudflare:workers';
import { Hono } from 'hono';
import { createMcpHandler } from 'agents/mcp';
import { api } from './api/app';
import { createMcpServer } from './mcp/server';
import { verifyWebhookSignature } from './sync/github';
import { runCacheRefresh } from './data/kv-cache';
import { SECURITY_HEADERS } from '@superbenefit/porch/security';
import type { GitHubPushEvent } from './types/sync';

// Re-export workflow so Cloudflare can discover it via wrangler.jsonc class_name
export { GovernanceSyncWorkflow } from './sync/workflow';

// ---------------------------------------------------------------------------
// Hono app — mounts public REST API
// ---------------------------------------------------------------------------

const app = new Hono<{ Bindings: Env }>();

// Root landing page
app.get('/', (c) => {
  if (c.req.header('Accept')?.includes('application/json')) {
    return c.json({
      name: 'SuperBenefit Governance Server',
      version: '0.1.0',
      endpoints: {
        dao: '/dao.json',
        api: '/api/v1',
        docs: '/api/v1/docs',
        openapi: '/api/v1/openapi.json',
        mcp: '/mcp',
      },
      daoip2: 'https://github.com/metagov/daostar/blob/main/DAOIPs/daoip-2.md',
    });
  }
  return c.html(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>SuperBenefit Governance Server</title>
<style>
*{margin:0;padding:0;box-sizing:border-box}
body{font-family:system-ui,-apple-system,sans-serif;background:#0a0a0b;color:#e4e4e7;min-height:100vh;display:flex;align-items:center;justify-content:center}
.container{max-width:540px;width:100%;padding:2rem}
h1{font-size:1.5rem;font-weight:600;margin-bottom:.25rem}
.subtitle{color:#a1a1aa;font-size:.875rem;margin-bottom:2rem}
.version{display:inline-block;font-size:.75rem;color:#71717a;border:1px solid #27272a;border-radius:9999px;padding:.125rem .5rem;margin-left:.5rem;vertical-align:middle}
.section{margin-bottom:1.5rem}
.section-title{font-size:.75rem;font-weight:500;color:#71717a;text-transform:uppercase;letter-spacing:.05em;margin-bottom:.75rem}
a{color:#e4e4e7;text-decoration:none;display:flex;align-items:center;gap:.75rem;padding:.625rem .875rem;border-radius:.5rem;border:1px solid #27272a;background:#18181b;margin-bottom:.5rem;transition:border-color .15s,background .15s}
a:hover{border-color:#3f3f46;background:#1f1f23}
.label{font-size:.875rem;font-weight:500}
.path{font-size:.75rem;color:#71717a;font-family:ui-monospace,monospace}
.dot{width:8px;height:8px;border-radius:50%;flex-shrink:0}
.dot-green{background:#22c55e}
.dot-blue{background:#3b82f6}
.dot-purple{background:#a855f7}
.footer{margin-top:2rem;padding-top:1rem;border-top:1px solid #1c1c1f;font-size:.75rem;color:#52525b}
.footer a{display:inline;border:0;background:0;padding:0;color:#a855f7}
.footer a:hover{text-decoration:underline}
</style>
</head>
<body>
<div class="container">
  <h1>Governance Server<span class="version">v0.1.0</span></h1>
  <p class="subtitle">SuperBenefit DAO governance state — DAOIP-2 compliant API and MCP server</p>
  <div class="section">
    <div class="section-title">DAOIP-2</div>
    <a href="/dao.json"><span class="dot dot-green"></span><span><span class="label">DAO Descriptor</span><br><span class="path">/dao.json</span></span></a>
  </div>
  <div class="section">
    <div class="section-title">API</div>
    <a href="/api/v1/docs"><span class="dot dot-green"></span><span><span class="label">API Documentation</span><br><span class="path">/api/v1/docs</span></span></a>
    <a href="/api/v1/members"><span class="dot dot-blue"></span><span><span class="label">Members</span><br><span class="path">/api/v1/members</span></span></a>
    <a href="/api/v1/proposals"><span class="dot dot-blue"></span><span><span class="label">Proposals</span><br><span class="path">/api/v1/proposals</span></span></a>
    <a href="/api/v1/roles"><span class="dot dot-blue"></span><span><span class="label">Roles (Hats)</span><br><span class="path">/api/v1/roles</span></span></a>
    <a href="/api/v1/groups"><span class="dot dot-blue"></span><span><span class="label">Groups / Cells</span><br><span class="path">/api/v1/groups</span></span></a>
    <a href="/api/v1/agreements"><span class="dot dot-blue"></span><span><span class="label">Agreements</span><br><span class="path">/api/v1/agreements</span></span></a>
    <a href="/api/v1/policies"><span class="dot dot-blue"></span><span><span class="label">Policies</span><br><span class="path">/api/v1/policies</span></span></a>
  </div>
  <div class="section">
    <div class="section-title">MCP</div>
    <a href="/mcp"><span class="dot dot-purple"></span><span><span class="label">MCP Server</span><br><span class="path">/mcp</span></span></a>
  </div>
  <div class="footer">Part of the <a href="https://superbenefit.org">SuperBenefit</a> MCPorch ecosystem</div>
</div>
</body>
</html>`);
});

// DAOIP-2 top-level descriptor — canonical entry point
app.route('/', api);

// ---------------------------------------------------------------------------
// WorkerEntrypoint — HTTP, cron, and RPC interface
// ---------------------------------------------------------------------------

export default class GovernanceServer extends WorkerEntrypoint<Env> {
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Rate limiting — key on client IP
    const clientIp = request.headers.get('CF-Connecting-IP') ?? 'unknown';
    const { success } = await this.env.RATE_LIMITER.limit({ key: clientIp });
    if (!success) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded' }), {
        status: 429,
        headers: { 'Content-Type': 'application/json', 'Retry-After': '60', ...SECURITY_HEADERS },
      });
    }

    // MCP server — created per-request (stateless, CVE GHSA-qgp8-v765-qxx9)
    if (url.pathname === '/mcp' || url.pathname.startsWith('/mcp/')) {
      const server = createMcpServer(this.env);
      const handler = createMcpHandler(server, {
        route: '/mcp',
        corsOptions: {
          origin: '*',
          methods: 'GET, POST, OPTIONS',
          headers: 'Content-Type, Accept, Authorization, Mcp-Session-Id',
        },
      });
      const response = await handler(request, this.env, this.ctx);
      const securedResponse = new Response(response.body, response);
      for (const [key, value] of Object.entries(SECURITY_HEADERS)) {
        securedResponse.headers.set(key, value);
      }
      return securedResponse;
    }

    // GitHub webhook — governance repo push events
    if (url.pathname === '/webhook' && request.method === 'POST') {
      return this.handleWebhook(request);
    }

    // Internal refresh — protected by INTERNAL_REFRESH_SECRET
    if (url.pathname === '/internal/refresh' && request.method === 'POST') {
      return this.handleInternalRefresh(request);
    }

    // Everything else through Hono (REST API)
    return app.fetch(request, this.env, this.ctx);
  }

  /**
   * Cron trigger — refresh KV cache from external sources.
   * A single 15-min cron gates each source by its own last-run timestamp.
   */
  async scheduled(event: ScheduledEvent): Promise<void> {
    await runCacheRefresh(this.env);
  }

  // -------------------------------------------------------------------------
  // Webhook handler
  // -------------------------------------------------------------------------

  private async handleWebhook(request: Request): Promise<Response> {
    const body = await request.text();
    const signature = request.headers.get('x-hub-signature-256');
    const deliveryId = request.headers.get('x-github-delivery');

    if (!await verifyWebhookSignature(body, signature, this.env.GITHUB_WEBHOOK_SECRET)) {
      return new Response('Invalid signature', { status: 403 });
    }

    // Replay protection via delivery ID nonce
    if (deliveryId) {
      const nonceKey = `webhook:${deliveryId}`;
      const existing = await this.env.SYNC_STATE.get(nonceKey);
      if (existing) {
        return Response.json({ status: 'duplicate', deliveryId });
      }
      await this.env.SYNC_STATE.put(nonceKey, Date.now().toString(), { expirationTtl: 86400 });
    }

    const payload: GitHubPushEvent = JSON.parse(body);

    if (payload.ref !== 'refs/heads/main') {
      return Response.json({ status: 'ignored', reason: 'not main branch' });
    }

    const changedFiles = payload.commits
      .flatMap((c) => [...c.added, ...c.modified])
      .filter((f) => f.endsWith('.md'));
    const deletedFiles = payload.commits
      .flatMap((c) => c.removed)
      .filter((f) => f.endsWith('.md'));

    const uniqueChanged = [...new Set(changedFiles)];
    const uniqueDeleted = [...new Set(deletedFiles)];

    if (uniqueChanged.length === 0 && uniqueDeleted.length === 0) {
      return Response.json({ status: 'ignored', reason: 'no markdown files changed' });
    }

    this.ctx.waitUntil(
      this.env.GOVERNANCE_SYNC.create({
        params: { changedFiles: uniqueChanged, deletedFiles: uniqueDeleted, commitSha: payload.after },
      })
    );

    return Response.json({ status: 'ok', changed: uniqueChanged.length, deleted: uniqueDeleted.length });
  }

  // -------------------------------------------------------------------------
  // Internal refresh endpoint — allows manual cache bust
  // -------------------------------------------------------------------------

  private async handleInternalRefresh(request: Request): Promise<Response> {
    const secret = request.headers.get('x-refresh-secret');
    if (secret !== this.env.INTERNAL_REFRESH_SECRET) {
      return new Response('Forbidden', { status: 403 });
    }
    await runCacheRefresh(this.env, { force: true });
    return Response.json({ status: 'ok', refreshed: new Date().toISOString() });
  }

  // -------------------------------------------------------------------------
  // RPC methods — callable via service bindings from other Workers
  // -------------------------------------------------------------------------

  /** Get current member list with optional role/group filters. */
  async getMembers(params?: { role?: string; group?: string }) {
    const { fetchMembers } = await import('./data/sources/sprb');
    return fetchMembers(this.env, params);
  }

  /** Get governance roles (Hats tree). */
  async getRoles(params?: { hatId?: string }) {
    const { fetchRoles } = await import('./data/sources/hats');
    return fetchRoles(this.env, params);
  }

  /** Get groups/cells. */
  async getGroups(params?: { id?: string }) {
    const { fetchGroups } = await import('./data/sources/groups');
    return fetchGroups(this.env, params);
  }

  /** Get agreements with optional domain filter. */
  async getAgreements(params?: { domain?: string }) {
    const { queryAgreements } = await import('./data/db');
    return queryAgreements(this.env.GOVERNANCE_DB, params);
  }

  /** Get policies with optional domain filter. */
  async getPolicies(params?: { domain?: string; agreementId?: string }) {
    const { queryPolicies } = await import('./data/db');
    return queryPolicies(this.env.GOVERNANCE_DB, params);
  }
}
