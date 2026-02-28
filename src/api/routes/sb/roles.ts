import { Hono } from 'hono';
import { fetchRoles, fetchRoleDetail } from '../../../data/sources/hats';

export const roleRoutes = new Hono<{ Bindings: Env }>();

roleRoutes.get('/', async (c) => {
  const roles = await fetchRoles(c.env);
  return c.json({ roles });
});

roleRoutes.get('/:hatId', async (c) => {
  const role = await fetchRoleDetail(c.req.param('hatId'), c.env);
  if (!role) return c.json({ error: 'Hat not found' }, 404);
  return c.json(role);
});
