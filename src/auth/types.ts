/**
 * Auth tier types for the three-phase auth model.
 *
 * Phase 1: All requests resolve to Open.
 * Phase 2: Cloudflare Access JWT → Public tier (member wallet addresses, full role context).
 * Phase 3: SPRB token ownership → Members tier (write-adjacent or restricted endpoints).
 */

export type AuthTier = 'open' | 'public' | 'members' | 'internal';

export interface AuthContext {
  tier: AuthTier;
  /** Resolved wallet address, present at public+ tier */
  address?: string;
  /** Whether the caller is another porch worker (internal service binding) */
  isInternal?: boolean;
}
