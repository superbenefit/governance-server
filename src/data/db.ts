/**
 * D1 query helpers for relational governance data.
 *
 * All queries are read-only. Write operations go through the sync workflow.
 * The schema is defined in migrations/0001_initial.sql.
 */

export interface Document {
  id: string;
  slug: string;
  type: 'agreement' | 'policy' | 'proposal' | 'other';
  title: string;
  status: 'draft' | 'active' | 'superseded' | 'retired';
  effectiveFrom?: string;
  effectiveTo?: string;
  contentHash?: string;
  enactedBy?: string; // Snapshot proposal ID
  r2Key?: string;
}

export interface DocumentWithDomains extends Document {
  domains: Domain[];
  relationships: DocumentRelationship[];
}

export interface Domain {
  id: string;
  slug: string;
  name: string;
  domainType: 'entity' | 'trust_zone' | 'governance_function';
  parentId?: string;
  hatId?: string;
}

export interface DocumentRelationship {
  fromId: string;
  toId: string;
  relationshipType: 'authorized_by' | 'implements' | 'supersedes' | 'references' | 'evaluates' | 'fulfills';
}

// ---------------------------------------------------------------------------
// Agreements
// ---------------------------------------------------------------------------

export async function queryAgreements(
  db: D1Database,
  params: { domain?: string },
): Promise<Document[]> {
  let query = `
    SELECT d.* FROM documents d
    WHERE d.type = 'agreement' AND d.status = 'active'
  `;
  const bindings: unknown[] = [];

  if (params.domain) {
    query = `
      SELECT d.* FROM documents d
      INNER JOIN document_domains dd ON dd.document_id = d.id
      INNER JOIN domains dom ON dom.id = dd.domain_id
      WHERE d.type = 'agreement' AND d.status = 'active'
        AND dom.slug = ?
    `;
    bindings.push(params.domain);
  }

  query += ' ORDER BY d.effective_from DESC';

  const result = await db.prepare(query).bind(...bindings).all<Document>();
  return result.results ?? [];
}

export async function queryAgreementDetail(
  db: D1Database,
  idOrSlug: string,
): Promise<DocumentWithDomains | null> {
  const doc = await db
    .prepare(`SELECT * FROM documents WHERE (id = ? OR slug = ?) AND type = 'agreement'`)
    .bind(idOrSlug, idOrSlug)
    .first<Document>();

  if (!doc) return null;

  const [domains, relationships] = await Promise.all([
    queryDocumentDomains(db, doc.id),
    queryDocumentRelationships(db, doc.id),
  ]);

  return { ...doc, domains, relationships };
}

// ---------------------------------------------------------------------------
// Policies
// ---------------------------------------------------------------------------

export async function queryPolicies(
  db: D1Database,
  params: { domain?: string; agreementId?: string },
): Promise<Document[]> {
  let query = `
    SELECT d.* FROM documents d
    WHERE d.type = 'policy' AND d.status = 'active'
  `;
  const bindings: unknown[] = [];

  if (params.domain) {
    query = `
      SELECT d.* FROM documents d
      INNER JOIN document_domains dd ON dd.document_id = d.id
      INNER JOIN domains dom ON dom.id = dd.domain_id
      WHERE d.type = 'policy' AND d.status = 'active'
        AND dom.slug = ?
    `;
    bindings.push(params.domain);
  }

  if (params.agreementId) {
    // Policies authorised by a specific agreement
    query = `
      SELECT d.* FROM documents d
      INNER JOIN document_relationships dr ON dr.from_id = d.id
      INNER JOIN documents agreement ON agreement.id = dr.to_id
      WHERE d.type = 'policy' AND d.status = 'active'
        AND dr.relationship_type = 'authorized_by'
        AND (agreement.id = ? OR agreement.slug = ?)
    `;
    bindings.push(params.agreementId, params.agreementId);
  }

  query += ' ORDER BY d.title ASC';

  const result = await db.prepare(query).bind(...bindings).all<Document>();
  return result.results ?? [];
}

export async function queryPolicyDetail(
  db: D1Database,
  idOrSlug: string,
): Promise<DocumentWithDomains | null> {
  const doc = await db
    .prepare(`SELECT * FROM documents WHERE (id = ? OR slug = ?) AND type = 'policy'`)
    .bind(idOrSlug, idOrSlug)
    .first<Document>();

  if (!doc) return null;

  const [domains, relationships] = await Promise.all([
    queryDocumentDomains(db, doc.id),
    queryDocumentRelationships(db, doc.id),
  ]);

  return { ...doc, domains, relationships };
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

async function queryDocumentDomains(db: D1Database, documentId: string): Promise<Domain[]> {
  const result = await db
    .prepare(`
      SELECT dom.* FROM domains dom
      INNER JOIN document_domains dd ON dd.domain_id = dom.id
      WHERE dd.document_id = ?
    `)
    .bind(documentId)
    .all<Domain>();
  return result.results ?? [];
}

async function queryDocumentRelationships(
  db: D1Database,
  documentId: string,
): Promise<DocumentRelationship[]> {
  const result = await db
    .prepare(`
      SELECT * FROM document_relationships
      WHERE from_id = ? OR to_id = ?
    `)
    .bind(documentId, documentId)
    .all<DocumentRelationship>();
  return result.results ?? [];
}
