/**
 * The admin's own routes, and the whole of its router.
 *
 * Path-based rather than hash-based, because the infrastructure for it is
 * already paid for: `not_found_handling: "single-page-application"` in
 * wrangler.jsonc means the Worker hands unknown paths to index.html, and the
 * Worker checks /api and /auth before it gets there — so /works reaches this
 * file and nothing collides.
 *
 * Nine routes and no parameters do not justify a routing library. What they do
 * justify is a route *table*: one array that navigation renders from, that the
 * shell dispatches on, and that keeps content and utility destinations in one
 * typed place. The previous shape had the labels in one const and the
 * rendering in a chain of `section === 'works' &&` further down the same file,
 * which is two lists to keep in step.
 *
 * The order is the order of the sidebar, and it is meant: the control panel is
 * where you land and where the state of the site is answered, the six editing
 * sections are the work — pages first, since a page is what the rest appears
 * on — and the last two are for looking backwards — at what
 * has been published, and at what the site's own frontend can read. The latter
 * is a utility and is reached from the account menu rather than the sidebar.
 */
import { useSyncExternalStore } from 'react';

export const ROUTES = [
  { path: 'control', labelKey: 'nav.control', group: 'overview' },
  { path: 'pages', labelKey: 'nav.pages', group: 'content' },
  { path: 'works', labelKey: 'nav.works', group: 'content' },
  { path: 'programs', labelKey: 'nav.programs', group: 'content' },
  { path: 'mentors', labelKey: 'nav.mentors', group: 'content' },
  { path: 'site', labelKey: 'nav.site', group: 'content' },
  { path: 'copy', labelKey: 'nav.copy', group: 'content' },
  { path: 'history', labelKey: 'nav.history', group: 'content' },
  { path: 'dev', labelKey: 'nav.developer', group: 'utility' },
] as const;

/** The sidebar is editorial navigation only. Account and developer utilities live in the header. */
export const SIDEBAR_ROUTES = ROUTES.filter((route) => route.group !== 'utility');

export type RoutePath = (typeof ROUTES)[number]['path'];

/** What `/` resolves to: the overview, not a form. */
export const DEFAULT_ROUTE: RoutePath = 'control';

export function href(route: RoutePath): string {
  return `/${route}`;
}

const listeners = new Set<() => void>();

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  window.addEventListener('popstate', listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener('popstate', listener);
  };
}

/**
 * The first path segment, if it names a route. Anything else — a stale
 * bookmark, a typo — lands on the default rather than a blank screen.
 */
function currentRoute(): RoutePath {
  const segment = window.location.pathname.replace(/^\/+/, '').split('/')[0] ?? '';
  return ROUTES.find((route) => route.path === segment)?.path ?? DEFAULT_ROUTE;
}

export function useRoute(): RoutePath {
  return useSyncExternalStore(subscribe, currentRoute);
}

/**
 * `pushState` does not fire `popstate`, so subscribers are told directly.
 * Going back still fires it, and both paths land on the same snapshot read.
 */
export function navigate(to: RoutePath): void {
  if (window.location.pathname === href(to)) return;
  window.history.pushState(null, '', href(to));
  for (const listener of listeners) listener();
}
