import { Hono } from 'hono';
import { queryPolicies, queryPolicyDetail } from '../../../data/db';

export const policyRoutes = new Hono<{ Bindings: Env }>();

policyRoutes.get('/', async (c) => {
  const domain = c.req.query('domain');
  const agreementId = c.req.query('agreementId');
  const policies = await queryPolicies(c.env.GOVERNANCE_DB, { domain, agreementId });
  return c.json({ policies });
});

policyRoutes.get('/:id', async (c) => {
  const policy = await queryPolicyDetail(c.env.GOVERNANCE_DB, c.req.param('id'));
  if (!policy) return c.json({ error: 'Policy not found' }, 404);
  return c.json(policy);
});
