import { Hono } from 'hono';
import { getDaoDescriptor } from '../../../data/kv-cache';

export const daoRoutes = new Hono<{ Bindings: Env }>();

daoRoutes.get('/', async (c) => {
  const descriptor = await getDaoDescriptor(c.env);
  return c.json(descriptor);
});
