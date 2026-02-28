-- Governance Server D1 Schema
-- Migration 0001: Initial tables
--
-- Apply with: npx wrangler d1 execute governance-db --file migrations/0001_initial.sql

-- ---------------------------------------------------------------------------
-- documents
-- One row per document identity. The stable slug is the primary human-readable key.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS documents (
  id            TEXT PRIMARY KEY,          -- UUID or stable slug
  slug          TEXT NOT NULL UNIQUE,      -- URL-safe identifier e.g. "operating-agreement"
  type          TEXT NOT NULL              -- 'agreement' | 'policy' | 'proposal' | 'other'
                CHECK (type IN ('agreement', 'policy', 'proposal', 'other')),
  title         TEXT NOT NULL,
  status        TEXT NOT NULL DEFAULT 'draft'
                CHECK (status IN ('draft', 'active', 'superseded', 'retired')),
  effective_from TEXT,                     -- ISO date string
  effective_to   TEXT,                     -- ISO date string; NULL means currently in effect
  content_hash  TEXT,                      -- SHA-256 of R2 content for change detection
  enacted_by    TEXT,                      -- Snapshot proposal ID that enacted this document
  r2_key        TEXT,                      -- R2 object key for raw markdown content
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_documents_type_status ON documents (type, status);
CREATE INDEX IF NOT EXISTS idx_documents_slug ON documents (slug);

-- ---------------------------------------------------------------------------
-- document_versions
-- Explicit supersession chain. When v2 replaces v1, both remain queryable.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_versions (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id),
  predecessor_id  TEXT REFERENCES documents(id),  -- NULL for first version
  version_note    TEXT,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_versions_document ON document_versions (document_id);

-- ---------------------------------------------------------------------------
-- domains
-- Two classification axes in a single table:
--   entity / trust_zone — organisational scope (who it applies to)
--   governance_function  — subject matter (what it governs)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS domains (
  id          TEXT PRIMARY KEY,
  slug        TEXT NOT NULL UNIQUE,       -- e.g. "metagovernance", "treasury", "dao-core"
  name        TEXT NOT NULL,
  domain_type TEXT NOT NULL
              CHECK (domain_type IN ('entity', 'trust_zone', 'governance_function')),
  parent_id   TEXT REFERENCES domains(id),  -- hierarchy support
  hat_id      TEXT,                          -- linked Hats hat ID, if applicable
  description TEXT,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_domains_type ON domains (domain_type);

-- ---------------------------------------------------------------------------
-- document_domains
-- Many-to-many: a document can belong to domains on both classification axes.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_domains (
  document_id TEXT NOT NULL REFERENCES documents(id),
  domain_id   TEXT NOT NULL REFERENCES domains(id),
  PRIMARY KEY (document_id, domain_id)
);

-- ---------------------------------------------------------------------------
-- document_relationships
-- Named, constrained directed edges between documents.
-- New relationship types require a migration — intentional, keeps types deliberate.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_relationships (
  id                TEXT PRIMARY KEY,
  from_id           TEXT NOT NULL REFERENCES documents(id),
  to_id             TEXT NOT NULL REFERENCES documents(id),
  relationship_type TEXT NOT NULL
                    CHECK (relationship_type IN (
                      'authorized_by',  -- policy derives authority from agreement
                      'implements',     -- policy gives effect to a principle/charter
                      'supersedes',     -- newer document replaces older one
                      'references',     -- general citation
                      'evaluates',      -- evaluation assesses proposal/agreement outcome
                      'fulfills'        -- output satisfies a commitment in an agreement
                    )),
  created_at        TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_relationships_from ON document_relationships (from_id);
CREATE INDEX IF NOT EXISTS idx_document_relationships_to ON document_relationships (to_id);

-- ---------------------------------------------------------------------------
-- document_scope
-- Maps documents to the on-chain entities they govern.
-- Bridge between governance documents and Hats/addresses/groups.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS document_scope (
  id              TEXT PRIMARY KEY,
  document_id     TEXT NOT NULL REFERENCES documents(id),
  entity_type     TEXT NOT NULL
                  CHECK (entity_type IN ('hat', 'address', 'group')),
  entity_id       TEXT NOT NULL,           -- hat ID, address, or group slug
  scope_relation  TEXT NOT NULL
                  CHECK (scope_relation IN ('governs', 'governed_by', 'party', 'signatory')),
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_document_scope_document ON document_scope (document_id);
CREATE INDEX IF NOT EXISTS idx_document_scope_entity ON document_scope (entity_type, entity_id);

-- ---------------------------------------------------------------------------
-- Seed: initial domains from governance.superbenefit.dev structure
-- ---------------------------------------------------------------------------
INSERT OR IGNORE INTO domains (id, slug, name, domain_type, description) VALUES
  ('dom-metagov',     'metagovernance',       'Metagovernance',         'governance_function', 'DAO-level governance rules and amendment processes'),
  ('dom-operations',  'operations',           'Operations',             'governance_function', 'Day-to-day contributor and operational policies'),
  ('dom-platforms',   'platforms',            'Platform Administration', 'governance_function', 'Digital infrastructure and platform management'),
  ('dom-dao-core',    'dao-core',             'DAO Core',               'entity',              'Top-level DAO entity and agreements'),
  ('dom-treasury',    'treasury',             'Treasury',               'governance_function', 'Financial management and resource allocation');
