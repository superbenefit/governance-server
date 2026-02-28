import { Hono } from 'hono';
import { queryAgreements, queryAgreementDetail } from '../../../data/db';

export const agreementRoutes = new Hono<{ Bindings: Env }>();

agreementRoutes.get('/', async (c) => {
  const domain = c.req.query('domain');
  const agreements = await queryAgreements(c.env.GOVERNANCE_DB, { domain });
  return c.json({ agreements });
});

agreementRoutes.get('/:id', async (c) => {
  const agreement = await queryAgreementDetail(c.env.GOVERNANCE_DB, c.req.param('id'));
  if (!agreement) return c.json({ error: 'Agreement not found' }, 404);
  return c.json(agreement);
});
