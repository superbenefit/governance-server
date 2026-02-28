# Governance Server

SuperBenefit governance state — DAOIP-2 compliant REST API and MCP server.

Part of the [MCPorch](https://github.com/superbenefit/mcporch) ecosystem.

## Architecture

See `message.txt` (Architecture Proposal) for full design rationale. This server:
- Exposes SuperBenefit's organisational state via a **DAOIP-2 REST API**
- Provides an **MCP server** for AI agent access
- Exposes **RPC methods** for service binding calls from other porch workers (knowledge server, etc.)

Data sources: Hats Protocol (roles), SPRB token (membership), Snapshot (proposals), ENS (identity), GitHub (governance docs).

Storage: Workers KV (cache), R2 (governance markdown), D1 (relational records).

## Setup

### 1. Confirm open questions before starting

From the architecture proposal:
- [ ] **SPRB contract address** — confirm and add to `wrangler.jsonc` vars
- [ ] **Hats tree ID on mainnet** — confirm and add to `wrangler.jsonc` vars
- [ ] **Snapshot space** — confirm `superbenefit.eth` is correct
- [ ] **Governance repo frontmatter** — audit against `src/sync/parser.ts` expected fields
- [ ] **knowledge-base `data/groups/` path** — confirm ontology migration is complete

### 2. Create Cloudflare resources

```bash
# KV namespaces
npx wrangler kv namespace create GOVERNANCE_CACHE
npx wrangler kv namespace create SYNC_STATE

# R2 bucket
npx wrangler r2 bucket create superbenefit-governance

# D1 database
npx wrangler d1 create governance-db
```

Copy the generated IDs into `wrangler.jsonc`.

### 3. Run database migration

```bash
# Local dev
npm run db:migrate:local

# Production
npm run db:migrate:remote
```

### 4. Set secrets

```bash
npx wrangler secret put GITHUB_TOKEN
npx wrangler secret put GITHUB_WEBHOOK_SECRET
npx wrangler secret put INTERNAL_REFRESH_SECRET
```

### 5. Install dependencies

```bash
npm install
# Required for ENS keccak256 — see src/data/sources/ens.ts
npm install @noble/hashes
```

Then update `src/data/sources/ens.ts` to use `@noble/hashes`:
```typescript
import { keccak_256 } from '@noble/hashes/sha3';
// Replace the placeholder keccak256 and keccak256Bytes functions
```

### 6. Dev

```bash
npm run dev  # starts on port 8789
```

### 7. Deploy

```bash
npm run deploy
```

### 8. Register GitHub webhook

In the `superbenefit/governance` repo settings:
- Payload URL: `https://governance-server.<your-subdomain>.workers.dev/webhook`
- Content type: `application/json`
- Secret: the value from `GITHUB_WEBHOOK_SECRET`
- Events: **Push** only

## Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /dao.json` | DAOIP-2 top-level descriptor |
| `GET /api/v1/members` | SPRB token holders |
| `GET /api/v1/proposals` | Snapshot proposals |
| `GET /api/v1/activity` | Activity log |
| `GET /api/v1/governance` | Governance document (markdown) |
| `GET /api/v1/contracts` | Contract addresses |
| `GET /api/v1/roles` | Hats tree |
| `GET /api/v1/roles/:hatId` | Single hat |
| `GET /api/v1/groups` | Cells and working groups |
| `GET /api/v1/groups/:id` | Single group |
| `GET /api/v1/agreements` | Agreements (from D1) |
| `GET /api/v1/agreements/:id` | Single agreement |
| `GET /api/v1/policies` | Policies (from D1) |
| `GET /api/v1/policies/:id` | Single policy |
| `GET /api/v1/openapi.json` | OpenAPI spec |
| `GET /api/v1/docs` | Scalar API docs UI |
| `GET /mcp` | MCP server |
| `POST /webhook` | GitHub push webhook |
| `POST /internal/refresh` | Force KV cache refresh |

## Known TODOs

- `src/data/sources/ens.ts` — replace placeholder `keccak256` with `@noble/hashes`
- `src/data/sources/snapshot.ts` — implement `fetchActivity` vote log
- `src/sync/parser.ts` — audit against actual governance repo frontmatter after confirming schema
- `src/mcp/resources.ts` — implement `governance://context` synthesis from R2 index files
- `src/api/app.ts` — replace placeholder OpenAPI spec with `@hono/zod-openapi` for full schema validation
- `src/data/sources/groups.ts` — depends on knowledge-base ontology migration completing `data/groups/`
