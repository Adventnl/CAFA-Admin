/**
 * Signing in, which is entirely GitHub's job plus one comparison.
 *
 * The account check is the whole access-control model. It happens after the
 * OAuth round trip because that is the first moment we know who signed in, and
 * it is the last thing that happens before a session is issued — so every route
 * behind `authorize` can take for granted that the studio is the one asking.
 *
 * The scope is `read:user`. It used to be `repo`, because the repository was
 * the database; now the content is in D1 and GitHub is only the sign-in, so the
 * token this returns cannot read or write anything. That is why it is discarded
 * here rather than sealed into the cookie — a stolen session is worth a session
 * and nothing else.
 */
import type { Env } from '../env';
import { ApiException } from '../shared/api-exception';

export class AuthService {
  constructor(private readonly env: Env) {}

  /** Where the browser is sent to sign in. */
  authorizeUrl(redirectUri: string, state: string): string {
    const authorize = new URL('https://github.com/login/oauth/authorize');
    authorize.searchParams.set('client_id', this.env.GITHUB_CLIENT_ID);
    authorize.searchParams.set('redirect_uri', redirectUri);
    authorize.searchParams.set('scope', 'read:user');
    authorize.searchParams.set('state', state);
    return authorize.toString();
  }

  /**
   * The code from the callback, exchanged for a login — or a refusal.
   *
   * Every failure is an ApiException carrying the sentence the studio should
   * read. The controller turns those into a redirect with `?error=`, because
   * this arm of the flow is a browser navigation rather than a fetch.
   */
  async exchange(code: string, redirectUri: string): Promise<string> {
    const exchange = await fetch('https://github.com/login/oauth/access_token', {
      method: 'POST',
      headers: { Accept: 'application/json', 'Content-Type': 'application/json' },
      body: JSON.stringify({
        client_id: this.env.GITHUB_CLIENT_ID,
        client_secret: this.env.GITHUB_CLIENT_SECRET,
        code,
        redirect_uri: redirectUri,
      }),
    });

    const granted = await exchange.json<{ access_token?: string }>();
    if (typeof granted.access_token !== 'string') {
      throw ApiException.unauthorized('GitHub refused the sign-in.');
    }

    const account = await fetch('https://api.github.com/user', {
      headers: {
        Accept: 'application/vnd.github+json',
        Authorization: `Bearer ${granted.access_token}`,
        'User-Agent': 'cafa-admin',
      },
    });
    if (!account.ok) throw ApiException.unauthorized('GitHub would not say who you are.');

    const { login } = await account.json<{ login: string }>();
    if (login.toLowerCase() !== this.env.OWNER_LOGIN.toLowerCase()) {
      throw ApiException.unauthorized(`${login} is not the studio account.`);
    }

    return login;
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
