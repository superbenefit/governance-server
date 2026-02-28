/**
 * Cloudflare Worker environment bindings for the Governance Server.
 * Generated types for all bindings declared in wrangler.jsonc.
 */

interface Env {
  // KV Namespaces
  GOVERNANCE_CACHE: KVNamespace;   // Cached external state (Hats, SPRB, Snapshot, ENS)
  SYNC_STATE: KVNamespace;         // Webhook delivery nonce deduplication

  // R2 Buckets
  GOVERNANCE_CONTENT: R2Bucket;    // Canonical markdown from governance repo

  // D1 Databases
  GOVERNANCE_DB: D1Database;       // Relational records: documents, domains, relationships

  // Workflows
  GOVERNANCE_SYNC: Workflow;       // GitHub → R2 + D1 sync pipeline

  // Rate limiter
  RATE_LIMITER: RateLimit;

  // Secrets (set via wrangler secret put)
  GITHUB_TOKEN: string;
  GITHUB_WEBHOOK_SECRET: string;
  INTERNAL_REFRESH_SECRET: string;

  // Vars
  ETH_RPC_URL: string;
  SNAPSHOT_SPACE: string;
  SB_ENS_NAME: string;
  SPRB_CONTRACT_ADDRESS: string;
  HATS_TREE_ID: string;
  GOVERNANCE_REPO: string;
  KNOWLEDGE_BASE_REPO: string;
}
