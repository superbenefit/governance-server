/**
 * Groups/Cells data source — fetched from superbenefit/knowledge-base on GitHub.
 *
 * After the knowledge base ontology migration, cell definitions live in
 * data/groups/ as structured frontmatter markdown files.
 *
 * OPEN QUESTION: This depends on the knowledge-base ontology migration being
 * complete. The data/groups/ path and frontmatter schema need to be confirmed.
 */

import { parseGroupFrontmatter } from '../../sync/parser';

const GROUPS_PATH = 'data/groups';

export interface Group {
  id: string;
  name: string;
  description?: string;
  status: 'active' | 'inactive' | 'archived';
  mandate?: string;
  linkedHats?: string[];
  members?: string[];
  url?: string;
}

export async function fetchGroups(env: Env, params?: { id?: string }): Promise<Group[]> {
  const cached = await env.GOVERNANCE_CACHE.get('sb:groups');
  let groups: Group[];

  if (cached) {
    groups = JSON.parse(cached);
  } else {
    groups = await fetchFromGitHub(env);
    await env.GOVERNANCE_CACHE.put('sb:groups', JSON.stringify(groups), { expirationTtl: 2 * 60 * 60 });
  }

  if (params?.id) {
    return groups.filter((g) => g.id === params.id || g.name.toLowerCase() === params.id!.toLowerCase());
  }

  return groups.filter((g) => g.status === 'active');
}

async function fetchFromGitHub(env: Env): Promise<Group[]> {
  const repo = env.KNOWLEDGE_BASE_REPO;
  const token = env.GITHUB_TOKEN;

  // List files in data/groups/
  const listUrl = `https://api.github.com/repos/${repo}/contents/${GROUPS_PATH}`;
  const listResponse = await fetch(listUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github.v3+json',
      'User-Agent': 'superbenefit-governance-server',
    },
  });

  if (listResponse.status === 404) {
    console.warn(`Groups path ${GROUPS_PATH} not found in ${repo} — ontology migration may be incomplete`);
    return [];
  }

  if (!listResponse.ok) {
    throw new Error(`GitHub API error listing groups: ${listResponse.status}`);
  }

  const files = await listResponse.json() as Array<{ name: string; download_url: string; type: string }>;
  const mdFiles = files.filter((f) => f.type === 'file' && f.name.endsWith('.md'));

  const groups = await Promise.allSettled(
    mdFiles.map(async (file): Promise<Group> => {
      const content = await fetchFileContent(file.download_url, token);
      return parseGroupFrontmatter(file.name.replace('.md', ''), content);
    })
  );

  return groups
    .filter((r): r is PromiseFulfilledResult<Group> => r.status === 'fulfilled')
    .map((r) => r.value);
}

async function fetchFileContent(url: string, token: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      'User-Agent': 'superbenefit-governance-server',
    },
  });
  if (!response.ok) throw new Error(`Failed to fetch ${url}: ${response.status}`);
  return response.text();
}
