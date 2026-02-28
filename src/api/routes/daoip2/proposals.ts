import { Hono } from 'hono';
import { fetchProposals, fetchProposalDetail } from '../../../data/sources/snapshot';

export const proposalRoutes = new Hono<{ Bindings: Env }>();

proposalRoutes.get('/', async (c) => {
  const status = c.req.query('status') as 'active' | 'closed' | 'pending' | undefined;
  const type = c.req.query('type');
  const proposals = await fetchProposals(c.env, { status, type });
  return c.json({
    '@context': 'http://www.daostar.org/schemas',
    '@type': 'DAO',
    proposals,
  });
});

proposalRoutes.get('/:id', async (c) => {
  const proposal = await fetchProposalDetail(c.req.param('id'), c.env);
  if (!proposal) return c.json({ error: 'Not found' }, 404);
  return c.json(proposal);
});
