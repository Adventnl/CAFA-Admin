/**
 * Saving, previewing and publishing — the three states the studio cares about,
 * and the only place the difference between a draft and the live site is
 * explained.
 *
 * "Is it live yet?" is answered by asking the site itself: the template writes
 * build-info.json with the revision it was built from, and the Worker fetches
 * it. A published revision that matches what the origin is serving means the
 * deploy landed. Nothing here infers it from elapsed time.
 *
 * The preview answers the same question against the draft, which has no
 * revision number of its own — so it reports a fingerprint of the content
 * instead, and the comparison is otherwise identical.
 */
import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';

import { publishService } from '../services/publish';
import type { SiteStatus } from '../services/types';
import type { Editor } from '../useEditor';

/** How often to re-ask while a build is in flight. */
const POLL_MS = 15_000;

type Deployment = 'current' | 'building' | 'unknown';

function deploymentOf(expected: number | null, actual: number | null): Deployment {
  if (actual === null || expected === null) return 'unknown';
  return actual === expected ? 'current' : 'building';
}

interface PublishBarProps {
  editor: Editor;
}

export function PublishBar({ editor }: PublishBarProps) {
  const { t } = useTranslation();
  const [status, setStatus] = useState<SiteStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setStatus(await publishService.status());
    } catch {
      // A failed status poll is not worth interrupting an edit over; the next
      // one will either succeed or the save will surface the real problem.
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const preview =
    status === null ? 'unknown' : deploymentOf(status.draftRevision, status.preview.revision);
  const production =
    status === null ? 'unknown' : deploymentOf(status.latestRevision, status.production.revision);
  const settling = preview === 'building' || production === 'building';

  useEffect(() => {
    if (!settling) return;
    const timer = setInterval(() => void refresh(), POLL_MS);
    return () => clearInterval(timer);
  }, [settling, refresh]);

  const blocked = editor.problems.length > 0;
  const unpublished = status?.unpublished ?? false;

  async function onSave(): Promise<void> {
    setNotice(null);
    if (await editor.save()) {
      setNotice(t('publish.savedNotice'));
      await refresh();
    }
  }

  async function onPublish(): Promise<void> {
    setBusy(true);
    setNotice(null);
    try {
      const result = await publishService.publish();
      setNotice(
        result.published
          ? t('publish.publishedNotice', { revision: result.revision })
          : (result.reason ?? t('publish.nothing')),
      );
      await refresh();
    } catch (error) {
      setNotice(error instanceof Error ? error.message : t('publish.failed'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="publish-bar" aria-label={t('publish.workflow')}>
      <div className="publish-state">
        {editor.dirty ? (
          <span className="pill pill-warn"><span className="status-dot" />{t('publish.unsaved')}</span>
        ) : (
          <span className="pill pill-success"><span className="status-dot" />{t('publish.saved')}</span>
        )}

        {unpublished && <span className="pill pill-warn">{t('publish.notLive')}</span>}

        {status?.latestRevision != null && (
          <span className="pill">{t('publish.revision', { revision: status.latestRevision })}</span>
        )}

        {preview === 'building' && <span className="pill">{t('publish.previewBuilding')}</span>}
        {production === 'building' && <span className="pill">{t('publish.publishing')}</span>}
      </div>

      <div className="publish-actions">
        <button
          type="button"
          className="workflow-action"
          disabled={!editor.dirty || editor.saving || editor.uploading || blocked}
          onClick={() => void onSave()}
        >
          <span className="workflow-step">{t('publish.stepSave')}</span>
          <span>{editor.saving ? t('publish.saving') : t('publish.save')}</span>
        </button>

        {status?.preview.url != null && !editor.dirty ? (
          <a className="workflow-action" href={status.preview.url} target="_blank" rel="noreferrer">
            <span className="workflow-step">{t('publish.stepPreview')}</span>
            <span>{t('publish.preview')} ↗</span>
          </a>
        ) : (
          <button className="workflow-action" type="button" disabled>
            <span className="workflow-step">{t('publish.stepPreview')}</span>
            <span>{status?.preview.url == null ? t('publish.previewUnavailable') : t('publish.preview')}</span>
          </button>
        )}

        <button
          type="button"
          className="workflow-action workflow-publish"
          disabled={busy || editor.dirty || !unpublished}
          onClick={() => void onPublish()}
        >
          <span className="workflow-step">{t('publish.stepPublish')}</span>
          <span>{busy ? t('publish.publishing') : t('publish.publish')}</span>
        </button>

        {status?.production.url != null && (
          <a className="live-link" href={status.production.url} target="_blank" rel="noreferrer">
            {t('publish.live')} ↗
          </a>
        )}
      </div>

      {editor.error !== null && <p className="problem publish-notice">{editor.error}</p>}
      {notice !== null && <p className="publish-notice">{notice}</p>}
      {editor.dirty && unpublished && (
        <p className="publish-notice">{t('publish.saveFirst')}</p>
      )}
    </div>
  );
}
