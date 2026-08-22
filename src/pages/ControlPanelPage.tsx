/**
 * Where the studio lands: what the site currently is, and where to change it.
 *
 * Everything on this page is already true somewhere else — the publish bar
 * knows the revision, the works page knows how many works there are, the dev
 * panel knows how many connectors there are. What this page adds is that they
 * are true *in one place*, which is the question you actually have when you
 * open the admin on a Tuesday: is what I published live, and is there anything
 * sitting unsaved.
 *
 * It reads and does not write. Every button here is a way to somewhere else;
 * publishing stays in the bar at the top, where it is on every page, because a
 * second Publish button is a second thing to keep in step with the first.
 */
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { href, navigate, type RoutePath } from '../routes';
import { connectorService } from '../services/connectors';
import { publishService } from '../services/publish';
import type { SiteStatus } from '../services/types';
import type { ContentSet } from '../content/types';
import type { Editor } from '../useEditor';

interface ControlPanelPageProps {
  editor: Editor;
}

export function ControlPanelPage({ editor }: ControlPanelPageProps) {
  const { t, i18n } = useTranslation();
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [connectors, setConnectors] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await publishService.status());
      } catch (error) {
        setFailure(error instanceof Error ? error.message : t('dashboard.stateFailed'));
      }
    })();
  }, []);

  // A separate effect, and a swallowed failure: the read API not answering is
  // worth knowing about on the dev panel, not worth an error banner here.
  useEffect(() => {
    void (async () => {
      try {
        const document = await connectorService.document();
        setConnectors(Object.keys(document.paths).length);
      } catch {
        setConnectors(null);
      }
    })();
  }, []);

  const content = editor.content;
  const photographs = countPhotographs(content);
  const privateWorks = content.works.filter((work) => work.status === 'private').length;

  return (
    <section>
      <div className="section-head">
        <h2>{t('dashboard.title')}</h2>
      </div>
      <p className="section-note">
        {t('dashboard.intro')}
      </p>

      {failure !== null && <p className="problem">{failure}</p>}

      <h3 className="panel-heading">{t('dashboard.now')}</h3>
      <div className="tiles">
        <Tile
          label={t('dashboard.draft')}
          value={editor.dirty ? t('publish.unsaved') : t('dashboard.everythingSaved')}
          note={
            editor.problems.length > 0
              ? t('dashboard.problemsBlock', { count: editor.problems.length })
              : t('dashboard.savingBuildsPreview')
          }
          warn={editor.dirty || editor.problems.length > 0}
        />
        <Tile
          label={t('dashboard.published')}
          value={status === null ? '…' : (status.latestRevision?.toString() ?? t('dashboard.nothingYet'))}
          note={
            status?.publishedAt == null
              ? t('dashboard.nothingPublished')
              : t('dashboard.revisionPublished', { date: formatPublished(status.publishedAt, i18n.language) })
          }
        />
        <Tile
          label={t('dashboard.liveSite')}
          value={status === null ? '…' : t(deploymentKey(status.latestRevision, status.production.revision))}
          note={status?.production.url ?? t('dashboard.noProduction')}
          warn={status !== null && status.unpublished}
          link={status?.production.url ?? undefined}
        />
        <Tile
          label={t('dashboard.preview')}
          value={
            status === null
              ? '…'
              : status.preview.url === null
                ? t('common.notConfigured')
                : t(deploymentKey(status.draftRevision, status.preview.revision))
          }
          note={status?.preview.url ?? t('dashboard.previewOptional')}
          link={status?.preview.url ?? undefined}
        />
      </div>

      <h3 className="panel-heading">{t('dashboard.contents')}</h3>
      <div className="tiles">
        <Tile
          label={t('dashboard.pages')}
          value={String(content.pages.length)}
          note={t('dashboard.pagesNote')}
          to="pages"
        />
        <Tile
          label={t('dashboard.works')}
          value={String(content.works.length)}
          note={privateWorks === 0 ? t('dashboard.allPublic') : t('dashboard.privateWorks', { count: privateWorks })}
          to="works"
        />
        <Tile label={t('dashboard.programs')} value={String(content.programs.length)} note={t('dashboard.teaching')} to="programs" />
        <Tile label={t('dashboard.mentors')} value={String(content.mentors.length)} note={t('dashboard.withPortraits')} to="mentors" />
        <Tile
          label={t('dashboard.photos')}
          value={String(photographs)}
          note={t('dashboard.photoNote')}
          to="works"
        />
        <Tile
          label={t('dashboard.siteText')}
          value="中文 / EN"
          note={t('dashboard.bilingualNote')}
          to="copy"
        />
        <Tile
          label={t('dashboard.studio')}
          value={content.site.contact.email === '' ? t('common.incomplete') : t('common.set')}
          note={t('dashboard.contactNote')}
          to="site"
        />
      </div>

      <h3 className="panel-heading">{t('dashboard.frontend')}</h3>
      <div className="tiles">
        <Tile
          label={t('dashboard.connectors')}
          value={connectors === null ? '…' : String(connectors)}
          note={t('dashboard.connectorsNote')}
          to="dev"
        />
        <Tile
          label="api.json"
          value="OpenAPI 3.1"
          note={t('dashboard.apiNote')}
          link="/api.json"
        />
        <Tile
          label={t('dashboard.history')}
          value={t('dashboard.historyValue')}
          note={t('dashboard.historyNote')}
          to="history"
        />
      </div>
    </section>
  );
}

interface TileProps {
  label: string;
  value: string;
  note: string;
  /** An admin route this tile leads to. */
  to?: RoutePath;
  /** An address outside the admin. Opens in a new tab. */
  link?: string;
  warn?: boolean;
}

function Tile({ label, value, note, to, link, warn }: TileProps) {
  const body = (
    <>
      <span className="tile-label">{label}</span>
      <strong className={`tile-value${warn === true ? ' tile-warn' : ''}`}>{value}</strong>
      <span className="tile-note">{note}</span>
    </>
  );

  if (to !== undefined) {
    return (
      <a
        className="tile tile-link"
        href={href(to)}
        onClick={(event) => {
          if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey) return;
          if (event.button !== 0) return;
          event.preventDefault();
          navigate(to);
        }}
      >
        {body}
      </a>
    );
  }

  if (link !== undefined) {
    return (
      <a className="tile tile-link" href={link} target="_blank" rel="noreferrer">
        {body}
      </a>
    );
  }

  return <article className="tile">{body}</article>;
}

/**
 * Whether an origin is serving what it should be.
 *
 * The same comparison the publish bar makes: the site writes the revision it
 * was built from into build-info.json, so "live" is what the site says about
 * itself rather than a guess from how long ago the deploy hook fired.
 */
function deploymentKey(expected: number | null, actual: number | null) {
  if (expected === null || actual === null) return 'common.unknown' as const;
  return expected === actual ? ('common.upToDate' as const) : ('common.building' as const);
}

/** Every photograph the draft names, counted once each. */
function countPhotographs(content: ContentSet): number {
  const keys = new Set<string>();
  const add = (src: string) => {
    if (src !== '') keys.add(src);
  };

  for (const work of content.works) {
    add(work.cover.src);
    for (const image of work.media) add(image.src);
  }
  for (const mentor of content.mentors) add(mentor.portrait.src);
  for (const page of content.pages) {
    for (const section of page.sections) {
      if (section.kind !== 'gallery') continue;
      for (const image of section.images) add(image.src);
    }
  }

  return keys.size;
}

/** D1 stores UTC without a zone marker; saying so stops it reading as local. */
function formatPublished(value: string, language: string): string {
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString(language.startsWith('zh') ? 'zh-CN' : 'en-NZ');
}
