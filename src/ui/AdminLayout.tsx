/**
 * The frame every page sits in: wordmark, publish bar, sidebar, content.
 *
 * The navigation renders from the route table rather than a list of its own, so
 * a page cannot exist without being reachable. Each item is a real `<a href>`
 * that the click handler intercepts — which means middle-click, ⌘-click and
 * "copy link" all behave, and the keyboard gets anchor semantics for free
 * rather than a button pretending to be a link.
 */
import type { ReactNode } from 'react';

import { href, navigate, ROUTES, type RoutePath } from '../routes';
import { sessionService } from '../services/session';
import { PublishBar } from './PublishBar';
import type { Editor } from '../useEditor';

interface AdminLayoutProps {
  editor: Editor;
  login: string;
  route: RoutePath;
  onSignedOut: () => void;
  children: ReactNode;
}

export function AdminLayout({ editor, login, route, onSignedOut, children }: AdminLayoutProps) {
  /**
   * A button rather than a link, because signing out is a POST now.
   *
   * The unsaved-changes question is asked here rather than left to the
   * browser's `beforeunload`, because nothing unloads — the app returns to the
   * sign-in screen in place, so this is the only place that can ask.
   */
  async function signOut() {
    if (editor.dirty && !window.confirm('There are unsaved changes. Sign out anyway?')) return;

    try {
      await sessionService.signOut();
    } finally {
      // Whatever the network did, the studio asked to be signed out. A request
      // that failed leaves a cookie behind on this browser and nowhere else.
      onSignedOut();
    }
  }

  return (
    <div className="shell">
      <header className="top">
        <h1 className="wordmark">c.a.f.a atelier — editor</h1>
        <PublishBar editor={editor} login={login} />
      </header>

      <div className="body">
        <nav className="sidebar" aria-label="Sections">
          <ul>
            {ROUTES.map((entry) => (
              <li key={entry.path}>
                <NavLink to={entry.path} current={route === entry.path}>
                  {entry.label}
                </NavLink>
              </li>
            ))}
          </ul>
          <button className="sidebar-link sidebar-out" type="button" onClick={() => void signOut()}>
            Sign out
          </button>
        </nav>

        <main className="main">{children}</main>
      </div>
    </div>
  );
}

interface NavLinkProps {
  to: RoutePath;
  current: boolean;
  children: ReactNode;
}

function NavLink({ to, current, children }: NavLinkProps) {
  return (
    <a
      className={`sidebar-link${current ? ' is-current' : ''}`}
      href={href(to)}
      aria-current={current ? 'page' : undefined}
      onClick={(event) => {
        // Let the browser handle anything that means "open this elsewhere".
        if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
        if (event.button !== 0) return;
        event.preventDefault();
        navigate(to);
      }}
    >
      {children}
    </a>
  );
}
