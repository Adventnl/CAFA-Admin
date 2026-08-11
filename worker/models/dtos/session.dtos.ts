/**
 * What the editor is told about its own session.
 *
 * A login and nothing else. There is no token to hand back — GitHub is the
 * sign-in and the OAuth scope is `read:user`, so there has been nothing worth
 * storing in the cookie since the content moved into D1.
 */
export interface SessionResponse {
  login: string;
}
