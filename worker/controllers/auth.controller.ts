/**
 * POST /auth/login, POST /auth/logout
 *
 * Both answer the normal envelope and set a cookie, which is the whole reason
 * they return a `Response` rather than letting the dispatcher serialise one:
 * `Set-Cookie` is a header, and an envelope on its own has nowhere to put it.
 *
 * These used to be redirects, because OAuth made them browser navigations and a
 * navigation cannot read a 401 body. They are ordinary fetches now, so a
 * refusal comes back as a refusal and the sign-in screen prints it in place —
 * no `?error=` on the URL, and no reload between typing a password and being
 * told it was wrong.
 *
 * POST rather than GET for both, including sign-out: neither is safe to
 * repeat from a prefetch, a crawler, or an <img> tag someone else wrote.
 */
import { sealSession, sessionCookie, clearedSessionCookie } from '../domain/session';
import type { SessionResponse, SignedOutResponse } from '../models/dtos/session.dtos';
import type { AuthService } from '../services/auth.service';
import { ApiException } from '../shared/api-exception';
import { ApiResponse, toResponse } from '../shared/api-response';
import type { RequestContext } from '../shared/router';

interface Credentials {
  username?: unknown;
  password?: unknown;
}

export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly sessionSecret: string,
  ) {}

  login = async ({ request }: RequestContext): Promise<Response> => {
    const { username, password } = await request.json<Credentials>();

    if (typeof username !== 'string' || typeof password !== 'string') {
      throw ApiException.badRequest('Send a username and a password.');
    }
    if (username === '' || password === '') {
      throw ApiException.badRequest('Fill in both fields.');
    }

    const login = await this.auth.signIn(username, password);
    const sealed = await sealSession(this.sessionSecret, { login });

    return toResponse(ApiResponse.ok<SessionResponse>({ login }, 'Signed in'), {
      'Set-Cookie': sessionCookie(sealed),
    });
  };

  /**
   * Anonymous on purpose. Signing out of a session that already expired is the
   * same request as signing out of a live one, and it should not answer 401.
   */
  logout = (): Response => {
    return toResponse(ApiResponse.ok<SignedOutResponse>({ signedOut: true }, 'Signed out'), {
      'Set-Cookie': clearedSessionCookie(),
    });
  };
}
