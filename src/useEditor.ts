/**
 * One place that knows what has changed and how to send it.
 *
 * Content is held whole rather than per-field: six JSON files, edited in
 * memory, written back in a single commit. Tracking which of the six a change
 * touched is enough — the files are small, and a diff of the whole file is what
 * git wants anyway.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { saveEdits, type FileEdit } from './api';
import { checkContent, type Problem } from './content/validate';
import { CONTENT_PATHS, MEDIA_ROOT, type ContentSet } from './content/types';

/** An image chosen in the browser but not yet committed. */
export interface PendingMedia {
  /** Repository path, e.g. "media-source/works/edible-house/03.jpg". */
  path: string;
  base64: string;
  /** For previewing it before it exists anywhere but here. */
  objectUrl: string;
}

export interface Editor {
  content: ContentSet;
  problems: Problem[];
  dirty: boolean;
  saving: boolean;
  error: string | null;
  update: <K extends keyof ContentSet>(key: K, value: ContentSet[K]) => void;
  stageMedia: (media: PendingMedia) => void;
  dropMedia: (path: string) => void;
  pendingMedia: PendingMedia[];
  /** A preview URL for a media path, whether it is staged or already committed. */
  mediaUrl: (src: string) => string;
  save: (message: string) => Promise<boolean>;
}

export function useEditor(initial: ContentSet, initialHead: string): Editor {
  const [content, setContent] = useState(initial);
  const [head, setHead] = useState(initialHead);
  const [touched, setTouched] = useState<ReadonlySet<keyof ContentSet>>(new Set());
  const [pending, setPending] = useState<PendingMedia[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Bumped on every save so committed images are re-fetched rather than cached. */
  const version = useRef(initialHead);

  const update = useCallback(<K extends keyof ContentSet>(key: K, value: ContentSet[K]) => {
    setContent((current) => ({ ...current, [key]: value }));
    setTouched((current) => new Set(current).add(key));
  }, []);

  const stageMedia = useCallback((media: PendingMedia) => {
    setPending((current) => [...current.filter((item) => item.path !== media.path), media]);
  }, []);

  const dropMedia = useCallback((path: string) => {
    setPending((current) => {
      const going = current.find((item) => item.path === path);
      if (going !== undefined) URL.revokeObjectURL(going.objectUrl);
      return current.filter((item) => item.path !== path);
    });
  }, []);

  const mediaUrl = useCallback(
    (src: string) => {
      const path = `${MEDIA_ROOT}/${src}`;
      const staged = pending.find((item) => item.path === path);
      if (staged !== undefined) return staged.objectUrl;
      return `/api/media?path=${encodeURIComponent(path)}&v=${version.current}`;
    },
    [pending],
  );

  const problems = useMemo(() => checkContent(content), [content]);
  const dirty = touched.size > 0 || pending.length > 0;

  const save = useCallback(
    async (message: string): Promise<boolean> => {
      if (!dirty || problems.length > 0) return false;
      setSaving(true);
      setError(null);

      const edits: FileEdit[] = [
        ...[...touched].map((key) => ({
          path: CONTENT_PATHS[key],
          content: `${JSON.stringify(content[key], null, 2)}\n`,
          encoding: 'utf-8' as const,
        })),
        ...pending.map((media) => ({
          path: media.path,
          content: media.base64,
          encoding: 'base64' as const,
        })),
      ];

      try {
        const result = await saveEdits(head, edits, message);
        setHead(result.head);
        version.current = result.head;
        setTouched(new Set());
        for (const media of pending) URL.revokeObjectURL(media.objectUrl);
        setPending([]);
        return true;
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : 'The save failed.');
        return false;
      } finally {
        setSaving(false);
      }
    },
    [content, dirty, head, pending, problems.length, touched],
  );

  return {
    content,
    problems,
    dirty,
    saving,
    error,
    update,
    stageMedia,
    dropMedia,
    pendingMedia: pending,
    mediaUrl,
    save,
  };
}
