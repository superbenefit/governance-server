/**
 * Checks whether the resolved auth context satisfies the required tier.
 * Used at the top of every MCP tool and API route handler.
 */

import type { AuthContext, AuthTier } from './types';

const TIER_RANK: Record<AuthTier, number> = {
  open: 0,
  public: 1,
  members: 2,
  internal: 3,
};

/**
 * Returns true if the context's tier meets or exceeds the required tier.
 */
export function checkTierAccess(context: AuthContext, required: AuthTier): boolean {
  return TIER_RANK[context.tier] >= TIER_RANK[required];
}

/**
 * Throws a 401-style error if tier check fails.
 * For use in MCP tools where throwing is the appropriate pattern.
 */
export function requireTier(context: AuthContext, required: AuthTier): void {
  if (!checkTierAccess(context, required)) {
    throw new Error(
      `Authentication required: this operation requires '${required}' tier access (current: '${context.tier}')`,
    );
  }
}
