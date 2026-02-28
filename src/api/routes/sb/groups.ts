import { Hono } from 'hono';
import { fetchGroups } from '../../../data/sources/groups';

export const groupRoutes = new Hono<{ Bindings: Env }>();

groupRoutes.get('/', async (c) => {
  const groups = await fetchGroups(c.env);
  return c.json({ groups });
});

groupRoutes.get('/:id', async (c) => {
  const groups = await fetchGroups(c.env, { id: c.req.param('id') });
  if (!groups.length) return c.json({ error: 'Group not found' }, 404);
  return c.json(groups[0]);
});
