import { Hono } from 'hono';

export const contractRoutes = new Hono<{ Bindings: Env }>();

contractRoutes.get('/', (c) => {
  const contracts = [];
  if (c.env.SPRB_CONTRACT_ADDRESS) {
    contracts.push({
      '@type': 'EthereumAddress',
      id: `eip155:1:${c.env.SPRB_CONTRACT_ADDRESS}`,
      name: 'SPRB Token',
      chain: 'eip155:1',
    });
  }
  return c.json({
    '@context': 'http://www.daostar.org/schemas',
    '@type': 'DAO',
    contracts,
  });
});
