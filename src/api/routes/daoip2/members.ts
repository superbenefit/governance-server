import { Hono } from 'hono';
import { fetchMembers, buildMembersPayload } from '../../../data/sources/sprb';

export const memberRoutes = new Hono<{ Bindings: Env }>();

memberRoutes.get('/', async (c) => {
  const role = c.req.query('role');
  const group = c.req.query('group');
  const payload = await buildMembersPayload(c.env);
  // Apply optional filters
  if (role || group) {
    const filtered = await fetchMembers(c.env, { role, group });
    return c.json({ ...payload, members: filtered.map((m) => ({ '@type': 'EthereumAddress', id: m.id, name: m.ensName })) });
  }
  return c.json(payload);
});

memberRoutes.get('/:address', async (c) => {
  const { fetchMemberDetail } = await import('../../../data/sources/sprb');
  const member = await fetchMemberDetail(c.req.param('address'), c.env);
  if (!member) return c.json({ error: 'Not found' }, 404);
  return c.json(member);
});
