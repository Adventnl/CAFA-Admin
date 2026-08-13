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
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [connectors, setConnectors] = useState<number | null>(null);
  const [failure, setFailure] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      try {
        setStatus(await publishService.status());
      } catch (error) {
        setFailure(error instanceof Error ? error.message : 'The site’s state could not be read.');
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
        <h2>Control panel</h2>
      </div>
      <p className="section-note">
        The state of the site, and the way in to every part of it. Saving keeps the draft; the
        preview shows the draft; publishing is what the public sees.
      </p>

      {failure !== null && <p className="problem">{failure}</p>}

      <h3 className="panel-heading">Right now</h3>
      <div className="tiles">
        <Tile
          label="Draft"
          value={editor.dirty ? 'Unsaved changes' : 'Everything saved'}
          note={
            editor.problems.length > 0
              ? `${editor.problems.length} problem${editor.problems.length === 1 ? '' : 's'} block the save`
              : 'Saving writes the live tables and rebuilds the preview.'
          }
          warn={editor.dirty || editor.problems.length > 0}
        />
        <Tile
          label="Published"
          value={status === null ? '…' : (status.latestRevision?.toString() ?? 'Nothing yet')}
          note={
            status?.publishedAt == null
              ? 'Nothing has been published from this admin.'
              : `Revision published ${formatPublished(status.publishedAt)}.`
          }
        />
        <Tile
          label="Live site"
          value={status === null ? '…' : deployment(status.latestRevision, status.production.revision)}
          note={status?.production.url ?? 'No production URL configured.'}
          warn={status !== null && status.unpublished}
          link={status?.production.url ?? undefined}
        />
        <Tile
          label="Preview"
          value={
            status === null
              ? '…'
              : status.preview.url === null
                ? 'Not configured'
                : deployment(status.draftRevision, status.preview.revision)
          }
          note={status?.preview.url ?? 'The preview build is optional.'}
          link={status?.preview.url ?? undefined}
        />
      </div>

      <h3 className="panel-heading">What is in the site</h3>
      <div className="tiles">
        <Tile
          label="Works"
          value={String(content.works.length)}
          note={privateWorks === 0 ? 'All of them public.' : `${privateWorks} private — listed, no page.`}
          to="works"
        />
        <Tile label="Programmes" value={String(content.programs.length)} note="Teaching." to="programs" />
        <Tile label="Mentors" value={String(content.mentors.length)} note="With portraits." to="mentors" />
        <Tile
          label="Photographs"
          value={String(photographs)}
          note="In the draft, across works, mentors and the studio."
          to="works"
        />
        <Tile
          label="Site text"
          value="中文 / EN"
          note="Both languages, always. A blank in either blocks the save."
          to="copy"
        />
        <Tile
          label="Studio & contact"
          value={content.site.contact.email === '' ? 'Incomplete' : 'Set'}
          note="Address, hours, and how people reach you."
          to="site"
        />
      </div>

      <h3 className="panel-heading">For the frontend</h3>
      <div className="tiles">
        <Tile
          label="Connectors"
          value={connectors === null ? '…' : String(connectors)}
          note="Read-only endpoints serving the published revision. No writes, no drafts."
          to="dev"
        />
        <Tile
          label="api.json"
          value="OpenAPI 3.1"
          note="Compiled from the connectors themselves. Hand it to whoever builds the site."
          link="/api.json"
        />
        <Tile
          label="History"
          value="Append-only"
          note="Every revision that was ever live, and the way back to one."
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
function deployment(expected: number | null, actual: number | null): string {
  if (expected === null || actual === null) return 'Unknown';
  return expected === actual ? 'Up to date' : 'Building…';
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
  for (const image of content.site.studio) add(image.src);

  return keys.size;
}

/** D1 stores UTC without a zone marker; saying so stops it reading as local. */
function formatPublished(value: string): string {
  const parsed = new Date(`${value.replace(' ', 'T')}Z`);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleString();
}
