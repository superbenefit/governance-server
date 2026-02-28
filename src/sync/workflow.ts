/**
 * GovernanceSyncWorkflow — durable sync of governance repo content to R2 + D1.
 *
 * Triggered by GitHub webhook push events.
 * Mirrors the knowledge-server KnowledgeSyncWorkflow pattern.
 *
 * Steps:
 *   1. Fetch changed files from GitHub
 *   2. Parse frontmatter and extract structured records
 *   3. Write raw markdown to R2
 *   4. Upsert records to D1 (documents, domains, relationships)
 *   5. Delete removed files from R2 and D1
 */

import { WorkflowEntrypoint, WorkflowStep } from 'cloudflare:workers';
import { parseGovernanceDocument } from './parser';

interface SyncParams {
  changedFiles: string[];
  deletedFiles: string[];
  commitSha: string;
}

export class GovernanceSyncWorkflow extends WorkflowEntrypoint<Env, SyncParams> {
  async run(event: { payload: SyncParams }, step: WorkflowStep): Promise<void> {
    const { changedFiles, deletedFiles, commitSha } = event.payload;

    // Step 1: Fetch file contents from GitHub
    const fileContents = await step.do('fetch-files', async () => {
      return fetchFilesFromGitHub(changedFiles, this.env);
    });

    // Step 2: Write to R2 + parse + upsert D1
    for (const [path, content] of Object.entries(fileContents)) {
      await step.do(`sync-file:${path}`, async () => {
        // Write raw markdown to R2
        const r2Key = `governance/${path}`;
        await this.env.GOVERNANCE_CONTENT.put(r2Key, content, {
          customMetadata: { commitSha, syncedAt: new Date().toISOString() },
        });

        // Parse frontmatter and upsert D1
        const parsed = parseGovernanceDocument(path, content);
        if (parsed) {
          await upsertDocument(this.env.GOVERNANCE_DB, parsed, r2Key);
        }
      });
    }

    // Step 3: Delete removed files
    for (const path of deletedFiles) {
      await step.do(`delete-file:${path}`, async () => {
        const r2Key = `governance/${path}`;
        await this.env.GOVERNANCE_CONTENT.delete(r2Key);
        await deleteDocument(this.env.GOVERNANCE_DB, path);
      });
    }
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function fetchFilesFromGitHub(
  paths: string[],
  env: Env,
): Promise<Record<string, string>> {
  const results: Record<string, string> = {};
  await Promise.all(
    paths.map(async (path) => {
      const url = `https://raw.githubusercontent.com/${env.GOVERNANCE_REPO}/main/${path}`;
      const response = await fetch(url, {
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          'User-Agent': 'superbenefit-governance-server',
        },
      });
      if (response.ok) {
        results[path] = await response.text();
      } else {
        console.warn(`Could not fetch ${path}: ${response.status}`);
      }
    }),
  );
  return results;
}

async function upsertDocument(
  db: D1Database,
  parsed: ReturnType<typeof parseGovernanceDocument>,
  r2Key: string,
): Promise<void> {
  if (!parsed) return;

  const { id, slug, type, title, status, effectiveFrom, effectiveTo, enactedBy, domains, relationships, scope } = parsed;

  // Upsert document
  await db
    .prepare(`
      INSERT INTO documents (id, slug, type, title, status, effective_from, effective_to, enacted_by, r2_key, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))
      ON CONFLICT(slug) DO UPDATE SET
        title = excluded.title,
        status = excluded.status,
        effective_from = excluded.effective_from,
        effective_to = excluded.effective_to,
        enacted_by = excluded.enacted_by,
        r2_key = excluded.r2_key,
        updated_at = excluded.updated_at
    `)
    .bind(id, slug, type, title, status, effectiveFrom ?? null, effectiveTo ?? null, enactedBy ?? null, r2Key)
    .run();

  // Upsert domain associations
  for (const domainSlug of domains) {
    const domain = await db
      .prepare('SELECT id FROM domains WHERE slug = ?')
      .bind(domainSlug)
      .first<{ id: string }>();
    if (domain) {
      await db
        .prepare('INSERT OR IGNORE INTO document_domains (document_id, domain_id) VALUES (?, ?)')
        .bind(id, domain.id)
        .run();
    }
  }

  // Upsert relationships (requires both documents to exist)
  for (const rel of relationships) {
    const target = await db
      .prepare('SELECT id FROM documents WHERE slug = ?')
      .bind(rel.targetSlug)
      .first<{ id: string }>();
    if (target) {
      const relId = `${id}:${rel.type}:${target.id}`;
      await db
        .prepare(`
          INSERT OR IGNORE INTO document_relationships (id, from_id, to_id, relationship_type)
          VALUES (?, ?, ?, ?)
        `)
        .bind(relId, id, target.id, rel.type)
        .run();
    }
  }
}

async function deleteDocument(db: D1Database, path: string): Promise<void> {
  const slug = pathToSlug(path);
  // Mark as retired rather than hard delete (preserves history)
  await db
    .prepare(`UPDATE documents SET status = 'retired', updated_at = datetime('now') WHERE slug = ?`)
    .bind(slug)
    .run();
}

function pathToSlug(path: string): string {
  return path.replace(/^(agreements|policies)\//, '').replace(/\.md$/, '').replace(/\//g, '-');
}
