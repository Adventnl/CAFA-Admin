/**
 * The frame every page sits in: brand, draft workflow, account utilities,
 * editorial navigation and content.
 *
 * Navigation renders from the route table rather than a list of its own. Each
 * item is a real `<a href>`
 * that the click handler intercepts — which means middle-click, ⌘-click and
 * "copy link" all behave, and the keyboard gets anchor semantics for free
 * rather than a button pretending to be a link.
 */
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';

import { href, navigate, SIDEBAR_ROUTES, type RoutePath } from '../routes';
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
  const { t, i18n } = useTranslation();
  /**
   * A button rather than a link, because signing out is a POST now.
   *
   * The unsaved-changes question is asked here rather than left to the
   * browser's `beforeunload`, because nothing unloads — the app returns to the
   * sign-in screen in place, so this is the only place that can ask.
   */
  async function signOut() {
    if (editor.dirty && !window.confirm(t('account.unsavedSignOut'))) return;

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
        <div className="top-main">
          <a className="brand" href={href('control')} onClick={(event) => {
            if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
            if (event.button !== 0) return;
            event.preventDefault();
            navigate('control');
          }}>
            <span className="brand-mark">c.a.f.a</span>
            <span className="brand-label">{t('app.editor')}</span>
          </a>

          <PublishBar editor={editor} />

          <details className="account-menu">
            <summary aria-label={t('account.menu')}>
              <span className="account-avatar" aria-hidden="true">{login.slice(0, 1).toUpperCase()}</span>
              <span className="account-name">{login}</span>
            </summary>
            <div className="account-popover">
              <div className="account-heading">
                <span>{t('account.signedInAs')}</span>
                <strong>{login}</strong>
              </div>

              <div className="language-control">
                <span className="utility-label">{t('account.language')}</span>
                <div className="segmented" role="group" aria-label={t('account.language')}>
                  <button
                    type="button"
                    className={i18n.resolvedLanguage === 'en' ? 'is-selected' : ''}
                    aria-pressed={i18n.resolvedLanguage === 'en'}
                    onClick={() => void i18n.changeLanguage('en')}
                  >
                    EN
                  </button>
                  <button
                    type="button"
                    className={i18n.resolvedLanguage === 'zh' ? 'is-selected' : ''}
                    aria-pressed={i18n.resolvedLanguage === 'zh'}
                    onClick={() => void i18n.changeLanguage('zh')}
                  >
                    中文
                  </button>
                </div>
              </div>

              <NavLink to="dev" current={route === 'dev'} className="utility-link">
                <span aria-hidden="true">&lt;/&gt;</span> {t('nav.developer')}
              </NavLink>
              <button className="utility-link utility-signout" type="button" onClick={() => void signOut()}>
                <span aria-hidden="true">↗</span> {t('account.signOut')}
              </button>
            </div>
          </details>
        </div>
      </header>

      <div className="body">
        <nav className="sidebar" aria-label={t('nav.label')}>
          <span className="sidebar-group">{t('nav.overview')}</span>
          <ul className="sidebar-list">
            {SIDEBAR_ROUTES.filter((entry) => entry.group === 'overview').map((entry) => (
              <li key={entry.path}>
                <NavLink to={entry.path} current={route === entry.path}>
                  {t(entry.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
          <span className="sidebar-group">{t('nav.content')}</span>
          <ul className="sidebar-list">
            {SIDEBAR_ROUTES.filter((entry) => entry.group === 'content').map((entry) => (
              <li key={entry.path}>
                <NavLink to={entry.path} current={route === entry.path}>
                  {t(entry.labelKey)}
                </NavLink>
              </li>
            ))}
          </ul>
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
  className?: string;
}

function NavLink({ to, current, children, className = 'sidebar-link' }: NavLinkProps) {
  return (
    <a
      className={`${className}${current ? ' is-current' : ''}`}
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
