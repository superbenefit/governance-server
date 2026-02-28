/**
 * Hono REST API — mounts all DAOIP-2 and SB extension routes.
 * OpenAPI docs served at /api/v1/docs via Scalar.
 */

import { Hono } from 'hono';
import { daoRoutes } from './routes/daoip2/dao';
import { memberRoutes } from './routes/daoip2/members';
import { proposalRoutes } from './routes/daoip2/proposals';
import { contractRoutes } from './routes/daoip2/contracts';
import { activityRoutes } from './routes/daoip2/activity';
import { governanceDocRoute } from './routes/daoip2/governance-doc';
import { roleRoutes } from './routes/sb/roles';
import { groupRoutes } from './routes/sb/groups';
import { agreementRoutes } from './routes/sb/agreements';
import { policyRoutes } from './routes/sb/policies';

export const api = new Hono<{ Bindings: Env }>();

// ---------------------------------------------------------------------------
// DAOIP-2 top-level descriptor — served at /dao.json per spec
// ---------------------------------------------------------------------------
api.route('/dao.json', daoRoutes);

// ---------------------------------------------------------------------------
// DAOIP-2 standard endpoints
// ---------------------------------------------------------------------------
api.route('/api/v1/members', memberRoutes);
api.route('/api/v1/proposals', proposalRoutes);
api.route('/api/v1/activity', activityRoutes);
api.route('/api/v1/governance', governanceDocRoute);
api.route('/api/v1/contracts', contractRoutes);

// ---------------------------------------------------------------------------
// SuperBenefit extension endpoints
// ---------------------------------------------------------------------------
api.route('/api/v1/roles', roleRoutes);
api.route('/api/v1/groups', groupRoutes);
api.route('/api/v1/agreements', agreementRoutes);
api.route('/api/v1/policies', policyRoutes);

// ---------------------------------------------------------------------------
// Health check
// ---------------------------------------------------------------------------
api.get('/api/v1/health', (c) =>
  c.json({ status: 'ok', service: 'governance-server', timestamp: new Date().toISOString() }),
);

// ---------------------------------------------------------------------------
// OpenAPI spec (placeholder — replace with @hono/zod-openapi in Phase 1.5)
// ---------------------------------------------------------------------------
api.get('/api/v1/openapi.json', (c) =>
  c.json({
    openapi: '3.0.0',
    info: {
      title: 'SuperBenefit Governance API',
      version: '1.0.0',
      description: 'DAOIP-2 compliant governance API for SuperBenefit DAO',
    },
    paths: {
      '/dao.json': { get: { summary: 'DAOIP-2 top-level DAO descriptor', tags: ['DAOIP-2'] } },
      '/api/v1/members': { get: { summary: 'List DAO members (SPRB holders)', tags: ['DAOIP-2'] } },
      '/api/v1/proposals': { get: { summary: 'List Snapshot proposals', tags: ['DAOIP-2'] } },
      '/api/v1/activity': { get: { summary: 'Activity log', tags: ['DAOIP-2'] } },
      '/api/v1/governance': { get: { summary: 'Governance document', tags: ['DAOIP-2'] } },
      '/api/v1/contracts': { get: { summary: 'Contract addresses', tags: ['DAOIP-2'] } },
      '/api/v1/roles': { get: { summary: 'Hats role tree', tags: ['SuperBenefit'] } },
      '/api/v1/groups': { get: { summary: 'Cells and working groups', tags: ['SuperBenefit'] } },
      '/api/v1/agreements': { get: { summary: 'Agreements', tags: ['SuperBenefit'] } },
      '/api/v1/policies': { get: { summary: 'Policies', tags: ['SuperBenefit'] } },
    },
    externalDocs: {
      description: 'DAOIP-2 Specification',
      url: 'https://github.com/metagov/daostar/blob/main/DAOIPs/daoip-2.md',
    },
  }),
);

api.get('/api/v1/docs', (c) =>
  c.html(`<!doctype html>
<html>
<head>
  <title>SuperBenefit Governance API</title>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
</head>
<body>
  <script id="api-reference" data-url="/api/v1/openapi.json"></script>
  <script src="https://cdn.jsdelivr.net/npm/@scalar/api-reference"></script>
</body>
</html>`),
);
