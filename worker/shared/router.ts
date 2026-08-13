/**
 * The route table.
 *
 * A Worker has no attribute routing, so this is the nearest honest equivalent:
 * `allowAnonymous` and `authorize` are `[AllowAnonymous]` and `[Authorize]`,
 * and a template like `/api/revisions/:id/restore` is `[HttpPost("{id}/restore")]`.
 * Declaring which routes need a session *at registration* is the point — the
 * previous shape decided it with a `path.startsWith('/api/')` check halfway down
 * a 453-line handler, which is a rule you have to reconstruct by reading.
 *
 * Matching is exact on segment count, so `/api/content` and
 * `/api/content/published` cannot shadow one another however they are ordered.
 */
import type { ActionResult } from './api-response';
import type { CurrentUser } from './current-user';

export interface RequestContext {
  request: Request;
  url: URL;
  params: Readonly<Record<string, string>>;
}

export interface AuthorizedContext extends RequestContext {
  user: CurrentUser;
}

export type Handler<TContext extends RequestContext> = (
  context: TContext,
) => Promise<ActionResult> | ActionResult;

type Method = 'GET' | 'POST';

interface Route {
  method: Method;
  template: readonly string[];
}

/**
 * Discriminated rather than a boolean flag beside one handler type: an
 * anonymous handler is never handed a user, so the two cannot share a slot
 * without a cast, and a cast here would be the one place the whole
 * authentication guarantee could quietly be undone.
 */
type Registered =
  | (Route & { authorize: false; handler: Handler<RequestContext> })
  | (Route & { authorize: true; handler: Handler<AuthorizedContext> });

function segmentsOf(path: string): string[] {
  return path.split('/').filter((segment) => segment !== '');
}

/** The captured parameters, or null when this route is not the one. */
function capture(template: readonly string[], actual: readonly string[]) {
  if (template.length !== actual.length) return null;

  const params: Record<string, string> = {};
  for (let at = 0; at < template.length; at += 1) {
    const expected = template[at];
    const given = actual[at];
    if (expected === undefined || given === undefined) return null;

    if (expected.startsWith(':')) {
      params[expected.slice(1)] = decodeURIComponent(given);
      continue;
    }
    if (expected !== given) return null;
  }
  return params;
}

export class Router {
  private readonly routes: Registered[] = [];

  /** No session required. Signing in and out, and the two build-time reads. */
  allowAnonymous(method: Method, template: string, handler: Handler<RequestContext>): this {
    this.routes.push({ method, template: segmentsOf(template), authorize: false, handler });
    return this;
  }

  /** A session is resolved first, and the handler is given the user. */
  authorize(method: Method, template: string, handler: Handler<AuthorizedContext>): this {
    this.routes.push({ method, template: segmentsOf(template), authorize: true, handler });
    return this;
  }

  /**
   * The matched handler, already wrapped in whatever the route asked for.
   *
   * `null` means no route claimed this path, which is the caller's cue to fall
   * through to the static assets. A path that matched but with the wrong method
   * is answered rather than fallen through, so a mistyped verb reads as 405
   * instead of silently returning the SPA's index.html.
   */
  resolve(
    request: Request,
    url: URL,
  ):
    | { kind: 'anonymous'; handler: Handler<RequestContext>; params: Record<string, string> }
    | { kind: 'authorized'; handler: Handler<AuthorizedContext>; params: Record<string, string> }
    | { kind: 'method-not-allowed'; allowed: Method[] }
    | null {
    const actual = segmentsOf(url.pathname);
    const wrongMethod: Method[] = [];

    for (const route of this.routes) {
      const params = capture(route.template, actual);
      if (params === null) continue;

      if (route.method !== request.method) {
        if (!wrongMethod.includes(route.method)) wrongMethod.push(route.method);
        continue;
      }

      return route.authorize
        ? { kind: 'authorized', handler: route.handler, params }
        : { kind: 'anonymous', handler: route.handler, params };
    }

    if (wrongMethod.length > 0) return { kind: 'method-not-allowed', allowed: wrongMethod };
    return null;
  }
}
