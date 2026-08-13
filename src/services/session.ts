/**
 * Who is signed in, and the two calls that change the answer.
 *
 * `whoami` answers null rather than throwing on 401, because "signed out" is a
 * normal state for this call — it is the first thing the app asks, before there
 * is any reason to think there is a session. Every other status is a real
 * failure and still throws.
 *
 * `signIn` and `signOut` are ordinary fetches. They used to be navigations,
 * because OAuth made them redirects; now the Worker checks the password itself,
 * so a refusal comes back as an ApiError the sign-in screen can print without
 * the page ever reloading. The cookie they set is HttpOnly and arrives on the
 * response — nothing here touches it, or could.
 */
import { ApiError, request } from './http';
import type { SessionResponse, SignedOutResponse } from './types';

export const sessionService = {
  async whoami(): Promise<SessionResponse | null> {
    try {
      return await request<SessionResponse>('/api/session');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  /** The session on success; an ApiError carrying the refusal otherwise. */
  async signIn(username: string, password: string): Promise<SessionResponse> {
    return request<SessionResponse>('/auth/login', {
      method: 'POST',
      body: { username, password },
    });
  },

  async signOut(): Promise<void> {
    await request<SignedOutResponse>('/auth/logout', { method: 'POST' });
  },
};
