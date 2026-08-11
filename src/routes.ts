/**
 * The admin's own routes, and the whole of its router.
 *
 * Path-based rather than hash-based, because the infrastructure for it is
 * already paid for: `not_found_handling: "single-page-application"` in
 * wrangler.jsonc means the Worker hands unknown paths to index.html, and the
 * Worker checks /api and /auth before it gets there — so /works reaches this
 * file and nothing collides.
 *
 * Six routes and no parameters do not justify a routing library. What they do
 * justify is a route *table*: one array that the sidebar renders from, that the
 * shell dispatches on, and that a page cannot be added to without appearing in
 * the navigation. The previous shape had the labels in one const and the
 * rendering in a chain of `section === 'works' &&` further down the same file,
 * which is two lists to keep in step.
 */
import { useSyncExternalStore } from 'react';

export const ROUTES = [
  { path: 'works', label: 'Works' },
  { path: 'programs', label: 'Programmes' },
  { path: 'mentors', label: 'Mentors' },
  { path: 'site', label: 'Studio & contact' },
  { path: 'copy', label: 'Site text' },
  { path: 'history', label: 'History' },
] as const;

export type RoutePath = (typeof ROUTES)[number]['path'];

/** What `/` resolves to. The studio's work starts here more often than not. */
export const DEFAULT_ROUTE: RoutePath = 'works';

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
