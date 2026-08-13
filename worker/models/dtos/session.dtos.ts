/**
 * What the editor is told about its own session.
 *
 * A login and nothing else. There is no token to hand back and nothing else
 * worth putting in the cookie: the password is verified once, at sign-in, and
 * from then on the sealed name is the entire session.
 */
export interface SessionResponse {
  login: string;
}

/**
 * The answer to signing out.
 *
 * A body with something in it rather than a 204, because every other endpoint
 * here answers the envelope and the client unwraps `data` — a null payload is
 * how this client says "the server returned no data", i.e. a failure.
 */
export interface SignedOutResponse {
  signedOut: true;
}
