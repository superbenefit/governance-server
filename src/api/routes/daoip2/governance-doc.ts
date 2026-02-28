/**
 * DAOIP-2 governance document endpoint.
 * Returns the canonical governance markdown document.
 * Per DAOIP-2: governanceURI should point to a flatfile (.md), returning text/markdown.
 */
import { Hono } from 'hono';

export const governanceDocRoute = new Hono<{ Bindings: Env }>();

governanceDocRoute.get('/', async (c) => {
  // Try R2 first (synced from governance repo)
  const obj = await c.env.GOVERNANCE_CONTENT.get('governance.md');
  if (obj) {
    const text = await obj.text();
    return new Response(text, {
      headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
    });
  }

  // Fallback: fetch directly from GitHub
  const repo = c.env.GOVERNANCE_REPO;
  const response = await fetch(
    `https://raw.githubusercontent.com/${repo}/main/governance.md`,
    { headers: { Authorization: `Bearer ${c.env.GITHUB_TOKEN}`, 'User-Agent': 'superbenefit-governance-server' } },
  );

  if (!response.ok) {
    return c.json({ error: 'Governance document not found' }, 404);
  }

  const text = await response.text();
  return new Response(text, {
    headers: { 'Content-Type': 'text/markdown; charset=utf-8' },
  });
});
