/**
 * Signing in: one name and one password, checked here.
 *
 * This used to be a round trip through GitHub whose only real output was a
 * login to compare against `OWNER_LOGIN`. The comparison was the whole
 * access-control model, and it is still the whole access-control model — the
 * difference is that the studio now proves who it is with a password this
 * Worker verifies, instead of with an OAuth app that had to be registered,
 * kept in step with the hostname, and trusted with a redirect.
 *
 * The credentials live in secrets rather than in D1. There is exactly one
 * account, it changes about never, and a `wrangler secret put` is a shorter
 * path to a new password than a table, a migration and a screen to edit it.
 */
import { verifyPassword, isPasswordHash } from '../domain/password';
import type { Env } from '../env';
import { ApiException } from '../shared/api-exception';

/** Deliberately the same sentence for both halves — see `signIn`. */
const REFUSED = 'That username and password do not match.';

export class AuthService {
  constructor(private readonly env: Env) {}

  /**
   * The login to seal into a session, or a refusal.
   *
   * Two things are load-bearing about the shape of this. The password is
   * verified even when the username is already wrong, so the answer takes the
   * same few hundred milliseconds either way and the endpoint cannot be used to
   * find out what the username is. And both failures say the same sentence, for
   * the same reason.
   */
  async signIn(username: string, password: string): Promise<string> {
    const expectedUser = this.env.ADMIN_USERNAME;
    const expectedHash = this.env.ADMIN_PASSWORD_HASH;

    if (!expectedUser || !expectedHash || !isPasswordHash(expectedHash)) {
      throw new ApiException(
        503,
        'Sign-in is not configured on this deployment. Set ADMIN_USERNAME and ADMIN_PASSWORD_HASH.',
      );
    }

    // Both checks always run. `&&` would short-circuit the expensive one.
    const nameMatches = username.trim().toLowerCase() === expectedUser.trim().toLowerCase();
    const passwordMatches = await verifyPassword(password, expectedHash);

    if (!nameMatches || !passwordMatches) throw ApiException.unauthorized(REFUSED);

    // The configured spelling, not whatever case was typed: this is the name
    // that ends up on every revision as `published_by`.
    return expectedUser.trim();
  }

  /**
   * The preview build's shared secret.
   *
   * Not a session: Workers Builds has no cookie. An absent or empty
   * PREVIEW_TOKEN means the draft endpoint does not exist, which is the right
   * default — unpublished work should not be readable by accident.
   */
  assertPreviewBuild(offered: string | null): void {
    const expected = this.env.PREVIEW_TOKEN;
    if (expected === undefined || expected === '' || offered !== expected) {
      throw ApiException.unauthorized('Not the preview build.');
    }
  }
}
