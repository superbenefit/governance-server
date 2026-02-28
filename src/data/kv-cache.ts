/**
 * KV cache layer for external governance state.
 *
 * All external data (Hats, SPRB, Snapshot, ENS) is cached here with TTLs.
 * Cache misses fall through to the source, populate KV, then respond.
 *
 * The cron trigger calls runCacheRefresh() every 15 minutes.
 * Each source is gated by its own last-run timestamp stored in KV,
 * so sources with longer TTLs (e.g. ENS at 24h) are not refreshed every cycle.
 */

import { fetchMembers, buildMembersPayload } from './sources/sprb';
import { fetchRoles } from './sources/hats';
import { fetchProposals, fetchActivity } from './sources/snapshot';
import { fetchGroups } from './sources/groups';
import { buildDaoDescriptor } from '../schemas/daoip2';

// TTLs in seconds
const TTL = {
  members: 30 * 60,       // 30 min
  proposals: 15 * 60,     // 15 min
  activity: 15 * 60,      // 15 min
  roles: 30 * 60,         // 30 min
  groups: 2 * 60 * 60,    // 2 hours
  ensProfiles: 24 * 60 * 60, // 24 hours
} as const;

export async function getCachedValue(env: Env, key: string): Promise<string | null> {
  return env.GOVERNANCE_CACHE.get(key);
}

export async function setCachedValue(env: Env, key: string, value: unknown, ttl: number): Promise<void> {
  await env.GOVERNANCE_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttl });
}

/**
 * Get the full DAOIP-2 DAO descriptor, using KV cache with fallback.
 */
export async function getDaoDescriptor(env: Env): Promise<unknown> {
  const cached = await env.GOVERNANCE_CACHE.get('daoip2:dao');
  if (cached) return JSON.parse(cached);

  const descriptor = await buildDaoDescriptor(env);
  await env.GOVERNANCE_CACHE.put('daoip2:dao', JSON.stringify(descriptor), { expirationTtl: TTL.members });
  return descriptor;
}

/**
 * Run the full cache refresh cycle.
 * Called by the cron trigger every 15 minutes.
 * Each source is gated by its own last-run timestamp.
 */
export async function runCacheRefresh(env: Env, options?: { force?: boolean }): Promise<void> {
  const force = options?.force ?? false;
  const now = Date.now();

  await Promise.allSettled([
    refreshIfDue(env, 'daoip2:members', TTL.members, now, force, async () => {
      const members = await buildMembersPayload(env);
      return members;
    }),
    refreshIfDue(env, 'daoip2:proposals', TTL.proposals, now, force, () => fetchProposals(env, {})),
    refreshIfDue(env, 'daoip2:activity', TTL.activity, now, force, () => fetchActivity(env, {})),
    refreshIfDue(env, 'sb:roles', TTL.roles, now, force, () => fetchRoles(env)),
    refreshIfDue(env, 'sb:groups', TTL.groups, now, force, () => fetchGroups(env)),
  ]);

  // Invalidate assembled dao descriptor so it's rebuilt on next request
  if (force) {
    await env.GOVERNANCE_CACHE.delete('daoip2:dao');
  }
}

async function refreshIfDue(
  env: Env,
  key: string,
  ttlSeconds: number,
  now: number,
  force: boolean,
  fetcher: () => Promise<unknown>,
): Promise<void> {
  const lastRunKey = `lastrun:${key}`;
  if (!force) {
    const lastRun = await env.GOVERNANCE_CACHE.get(lastRunKey);
    if (lastRun && now - parseInt(lastRun, 10) < ttlSeconds * 1000) {
      return; // Not due yet
    }
  }

  try {
    const value = await fetcher();
    await env.GOVERNANCE_CACHE.put(key, JSON.stringify(value), { expirationTtl: ttlSeconds * 2 });
    await env.GOVERNANCE_CACHE.put(lastRunKey, now.toString(), { expirationTtl: ttlSeconds * 2 });
  } catch (err) {
    // Log but don't throw — a stale cache is better than a crashed cron
    console.error(`Cache refresh failed for ${key}:`, err);
  }
}
