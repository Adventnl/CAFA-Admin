/**
 * Who may read the public half of the API from a browser.
 *
 * The read API exists to be called from another origin — that is the whole
 * point of handing api.json to whoever is building the frontend — so those
 * routes answer any origin. It costs nothing: every one of them serves content
 * that is already on the public website, and none of them looks at the session
 * cookie, so there is no authority for a hostile page to borrow.
 *
 * The authenticated half is deliberately left out. It answers no cross-origin
 * caller at all, which is what stops a page somewhere else from acting as the
 * signed-in studio in a browser that has the cookie.
 *
 * Applied at the dispatcher rather than in the controller so that a 404 from a
 * mistyped path, or a 405 from the wrong verb, is *readable* cross-origin.
 * Without the header on the error too, a failed request reads as a CORS fault
 * in the console and the actual message never reaches the developer.
 */

/** The paths any origin may read: the compiled document and the v1 connectors. */
export function isPublicRead(url: URL): boolean {
  return url.pathname === '/api.json' || url.pathname.startsWith('/api/v1/');
}

/**
 * The same response, readable from anywhere.
 *
 * Rebuilt rather than mutated because a response that came back from a binding
 * can have immutable headers, and this runs over every kind of answer the
 * public routes produce.
 */
export function allowAnyOrigin(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', '*');

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}
