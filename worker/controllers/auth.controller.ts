/**
 * /auth/login, /auth/callback, /auth/logout
 *
 * The only routes in the admin that answer with a redirect and a cookie rather
 * than an envelope, because all three are browser navigations rather than
 * fetches. A failure here therefore cannot be a 401 body — nobody would see it
 * — so it comes back as a redirect to `/` carrying `?error=`, which the sign-in
 * screen prints.
 *
 * The redirect URI is derived from the request's own origin, so the value sent
 * to GitHub and the value GitHub calls back on agree by construction. GitHub
 * still checks it against what is registered on the OAuth app, which is why
 * moving this Worker's hostname means updating that registration too.
 */
import type { AuthService } from '../services/auth.service';
import { ApiException } from '../shared/api-exception';
import type { RequestContext } from '../shared/router';
import {
  clearedSessionCookie,
  clearedStateCookie,
  readState,
  sealSession,
  sealState,
  sessionCookie,
  stateCookie,
} from '../domain/session';

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessionSecret: string,
  ) {}

  login = async ({ url }: RequestContext): Promise<Response> => {
    const state = crypto.randomUUID();
    const redirectUri = new URL('/auth/callback', url.origin).toString();

    return new Response(null, {
      status: 302,
      headers: {
        Location: this.auth.authorizeUrl(redirectUri, state),
        'Set-Cookie': stateCookie(await sealState(this.sessionSecret, state)),
      },
    });
  };

  callback = async ({ request, url }: RequestContext): Promise<Response> => {
    const code = url.searchParams.get('code');
    const state = url.searchParams.get('state');
    const expected = await readState(request, this.sessionSecret);

    if (code === null || state === null || expected === null || state !== expected) {
      return refuse('That sign-in link expired. Try again.');
    }

    let login: string;
    try {
      login = await this.auth.exchange(code, new URL('/auth/callback', url.origin).toString());
    } catch (error) {
      return refuse(
        error instanceof ApiException ? error.message : 'The sign-in could not be completed.',
      );
    }

    // Only the login is kept. There is no longer a token worth storing.
    return new Response(null, {
      status: 302,
      headers: [
        ['Location', '/'],
        ['Set-Cookie', sessionCookie(await sealSession(this.sessionSecret, { login }))],
        ['Set-Cookie', clearedStateCookie()],
      ],
    });
  };

  logout = (): Response => {
    return new Response(null, {
      status: 302,
      headers: { Location: '/', 'Set-Cookie': clearedSessionCookie() },
    });
  };
}

/** Back to the sign-in screen with something the studio can read. */
function refuse(reason: string): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `/?error=${encodeURIComponent(reason)}`,
      'Set-Cookie': clearedStateCookie(),
    },
  });
}
