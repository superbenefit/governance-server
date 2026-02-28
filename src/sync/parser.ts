/**
 * Frontmatter parser for governance repository documents.
 *
 * Extracts structured records from markdown files with YAML frontmatter.
 * Used by the sync workflow and the groups data source.
 *
 * Expected frontmatter fields (all optional with sensible defaults):
 *
 *   type: agreement | policy | proposal | other
 *   title: string
 *   status: draft | active | superseded | retired
 *   effective_from: ISO date
 *   effective_to: ISO date
 *   domain: string | string[]     ← domain slugs (both axes)
 *   scope: string | string[]      ← hat IDs or group slugs
 *   enacted_by: string            ← Snapshot proposal ID
 *   related:                      ← cross-document relationships
 *     - type: authorized_by | implements | supersedes | references | evaluates | fulfills
 *       target: string            ← slug of related document
 *
 * OPEN QUESTION: Governance repo frontmatter audit needed before parser is finalised.
 * Missing fields default gracefully — the parser will not throw on sparse frontmatter.
 */

import type { Group } from '../data/sources/groups';

interface ParsedDocument {
  id: string;
  slug: string;
  type: 'agreement' | 'policy' | 'proposal' | 'other';
  title: string;
  status: 'draft' | 'active' | 'superseded' | 'retired';
  effectiveFrom?: string;
  effectiveTo?: string;
  enactedBy?: string;
  domains: string[];
  relationships: Array<{ type: string; targetSlug: string }>;
  scope: Array<{ entityType: 'hat' | 'address' | 'group'; entityId: string }>;
}

/**
 * Parse a governance document and extract structured records.
 * Returns null if the file should not be indexed (e.g. README, template).
 */
export function parseGovernanceDocument(path: string, content: string): ParsedDocument | null {
  // Skip non-document files
  if (path.includes('README') || path.includes('template') || path.includes('_')) {
    return null;
  }

  const fm = extractFrontmatter(content);
  if (!fm) return null;

  const slug = pathToSlug(path);
  const id = fm.id ?? slug;
  const type = normaliseType(fm.type);
  const status = normaliseStatus(fm.status);

  const domains = normaliseDomains(fm.domain ?? fm.domains ?? []);
  const relationships = normaliseRelationships(fm.related ?? fm.relationships ?? []);
  const scope = normaliseScope(fm.scope ?? []);

  return {
    id,
    slug,
    type,
    title: fm.title ?? titleFromPath(path),
    status,
    effectiveFrom: fm.effective_from ?? fm.effectiveFrom ?? undefined,
    effectiveTo: fm.effective_to ?? fm.effectiveTo ?? undefined,
    enactedBy: fm.enacted_by ?? fm.enactedBy ?? undefined,
    domains,
    relationships,
    scope,
  };
}

/**
 * Parse a group/cell frontmatter file from knowledge-base/data/groups/.
 */
export function parseGroupFrontmatter(id: string, content: string): Group {
  const fm = extractFrontmatter(content) ?? {};
  return {
    id,
    name: fm.title ?? fm.name ?? id,
    description: fm.description ?? undefined,
    status: fm.status === 'active' ? 'active' : fm.status === 'archived' ? 'archived' : 'inactive',
    mandate: fm.mandate ?? undefined,
    linkedHats: Array.isArray(fm.hats) ? fm.hats : fm.hats ? [fm.hats] : undefined,
    url: fm.url ?? undefined,
  };
}

// ---------------------------------------------------------------------------
// Private helpers
// ---------------------------------------------------------------------------

function extractFrontmatter(content: string): Record<string, unknown> | null {
  const match = content.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  if (!match) return null;
  return parseYamlSimple(match[1]);
}

/**
 * Minimal YAML parser for flat key: value and key: [list] frontmatter.
 * Does NOT handle nested objects — use a proper YAML library if needed.
 */
function parseYamlSimple(yaml: string): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const lines = yaml.split('\n');
  let currentKey: string | null = null;
  let currentList: string[] | null = null;

  for (const line of lines) {
    // List item
    if (line.match(/^\s+-\s+/)) {
      if (currentList !== null) {
        currentList.push(line.replace(/^\s+-\s+/, '').trim());
      } else if (currentKey) {
        // Object list item — simplified: parse "type: value" pairs
        const itemLine = line.replace(/^\s+-\s+/, '').trim();
        if (!result[currentKey]) result[currentKey] = [];
        (result[currentKey] as unknown[]).push(itemLine);
      }
      continue;
    }

    // Key: value
    const kvMatch = line.match(/^(\w[\w_-]*):\s*(.*)/);
    if (kvMatch) {
      if (currentList !== null && currentKey) {
        result[currentKey] = currentList;
        currentList = null;
      }
      currentKey = kvMatch[1];
      const value = kvMatch[2].trim();

      if (value === '' || value === '|' || value === '>') {
        // Start of list or block — initialise list
        currentList = [];
        result[currentKey] = currentList;
      } else if (value.startsWith('[') && value.endsWith(']')) {
        result[currentKey] = value.slice(1, -1).split(',').map((v) => v.trim().replace(/^['"]|['"]$/g, ''));
      } else {
        result[currentKey] = value.replace(/^['"]|['"]$/g, '');
        currentList = null;
      }
    }
  }

  if (currentList !== null && currentKey) {
    result[currentKey] = currentList;
  }

  return result;
}

function normaliseType(raw: unknown): ParsedDocument['type'] {
  if (raw === 'agreement') return 'agreement';
  if (raw === 'policy') return 'policy';
  if (raw === 'proposal') return 'proposal';
  return 'other';
}

function normaliseStatus(raw: unknown): ParsedDocument['status'] {
  if (raw === 'active') return 'active';
  if (raw === 'draft') return 'draft';
  if (raw === 'superseded') return 'superseded';
  if (raw === 'retired') return 'retired';
  return 'draft'; // default
}

function normaliseDomains(raw: unknown): string[] {
  if (!raw) return [];
  if (typeof raw === 'string') return [raw];
  if (Array.isArray(raw)) return raw.filter(Boolean).map(String);
  return [];
}

function normaliseRelationships(raw: unknown): Array<{ type: string; targetSlug: string }> {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === 'string') {
      // Inline format: "authorized_by: operating-agreement"
      const match = item.match(/^(\w+):\s*(.+)/);
      if (match) return [{ type: match[1], targetSlug: match[2].trim() }];
      return [];
    }
    if (typeof item === 'object' && item !== null) {
      const obj = item as Record<string, unknown>;
      if (obj.type && obj.target) {
        return [{ type: String(obj.type), targetSlug: String(obj.target) }];
      }
    }
    return [];
  });
}

function normaliseScope(raw: unknown): ParsedDocument['scope'] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((item) => {
    if (typeof item === 'string') {
      // Infer entity type from format
      if (item.startsWith('0x')) return [{ entityType: 'address', entityId: item }];
      if (/^\d/.test(item)) return [{ entityType: 'hat', entityId: item }];
      return [{ entityType: 'group', entityId: item }];
    }
    return [];
  });
}

function pathToSlug(path: string): string {
  return path
    .replace(/^(agreements|policies|proposals)\//, '')
    .replace(/\.md$/, '')
    .replace(/\//g, '-');
}

function titleFromPath(path: string): string {
  return pathToSlug(path)
    .split('-')
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}
