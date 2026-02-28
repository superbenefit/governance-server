/**
 * Resolves the auth context for an incoming request.
 *
 * Phase 1: Always returns open tier — no authentication required.
 *
 * Phase 2 (TODO): Parse Cloudflare Access JWT from the `Cf-Access-Jwt-Assertion`
 * header. On success, resolve the wallet address from the JWT sub claim and
 * return `{ tier: 'public', address }`. Requires Cloudflare Access to be
 * configured for this worker with the JWKS endpoint.
 *
 * Phase 3 (TODO): After resolving a wallet address, check on-chain SPRB
 * token balance via the ETH RPC. If balance > 0, return `{ tier: 'members', address }`.
 *
 * Internal callers (service bindings from other porch workers) can present a
 * porch service token in `x-porch-token`. In Phase 3, validate this token
 * and return `{ tier: 'members', isInternal: true }`.
 */

import type { AuthContext } from './types';

export async function resolveAuthContext(
  request: Request,
  env: Env,
): Promise<AuthContext> {
  // ----- Phase 2: Cloudflare Access JWT -----
  // const jwt = request.headers.get('Cf-Access-Jwt-Assertion');
  // if (jwt) {
  //   try {
  //     const payload = await verifyAccessJwt(jwt, env);
  //     const address = payload.sub; // wallet address from JWT
  //     // Phase 3: check SPRB balance
  //     // const balance = await getSPRBBalance(address, env);
  //     // if (balance > 0n) return { tier: 'members', address };
  //     return { tier: 'public', address };
  //   } catch {
  //     // Invalid JWT — fall through to open
  //   }
  // }

  // ----- Phase 3: Internal porch service token -----
  // const porchToken = request.headers.get('x-porch-token');
  // if (porchToken && await validatePorchToken(porchToken, env)) {
  //   return { tier: 'members', isInternal: true };
  // }

  return { tier: 'open' };
}
