/**
 * Who is signed in.
 *
 * `whoami` answers null rather than throwing on 401, because "signed out" is a
 * normal state for this call — it is the first thing the app asks, before there
 * is any reason to think there is a session. Every other status is a real
 * failure and still throws.
 *
 * Signing in and out are plain navigations rather than fetches: both are OAuth
 * redirects that have to set a cookie on a top-level request.
 */
import { ApiError, request } from './http';
import type { SessionResponse } from './types';

export const sessionService = {
  async whoami(): Promise<SessionResponse | null> {
    try {
      return await request<SessionResponse>('/api/session');
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) return null;
      throw error;
    }
  },

  loginUrl: '/auth/login',
  logoutUrl: '/auth/logout',
};
