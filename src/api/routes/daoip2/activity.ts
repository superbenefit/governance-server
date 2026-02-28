import { Hono } from 'hono';
import { fetchActivity } from '../../../data/sources/snapshot';

export const activityRoutes = new Hono<{ Bindings: Env }>();

activityRoutes.get('/', async (c) => {
  const member = c.req.query('member');
  const proposalId = c.req.query('proposalId');
  const activity = await fetchActivity(c.env, { member, proposalId });
  return c.json({
    '@context': 'http://www.daostar.org/schemas',
    '@type': 'DAO',
    activity,
  });
});
