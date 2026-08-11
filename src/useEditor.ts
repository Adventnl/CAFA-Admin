/**
 * One place that knows what has changed and how to send it.
 *
 * Content is held whole rather than per-field: six groups of records, edited in
 * memory, written back in one transaction. At 39 KB the whole set is cheaper to
 * send than a description of which parts of it moved.
 *
 * Photographs no longer wait for a save. They go to the bucket the moment they
 * are chosen, because the content that references one has a foreign key to it —
 * so the row has to exist first. That is the reverse of the old ordering, where
 * a single commit carried both, and it is the ordering a database wants: a save
 * can never name a photograph that is not there.
 */
import { useCallback, useMemo, useRef, useState } from 'react';

import { contentService } from './services/content';
import { ApiError } from './services/http';
import { mediaService } from './services/media';
import { checkContent, type Problem } from './content/validate';
import type { ContentSet, MediaInfo } from './content/types';
import { prepareImage } from './images';

export interface Editor {
  content: ContentSet;
  problems: Problem[];
  dirty: boolean;
  saving: boolean;
  /** True while a photograph is being resized and uploaded. */
  uploading: boolean;
  error: string | null;
  update: <K extends keyof ContentSet>(key: K, value: ContentSet[K]) => void;
  /** Resize, upload and register a photograph. Resolves when it is in the bucket. */
  putMedia: (key: string, file: File) => Promise<void>;
  /** A URL the editor can show a committed photograph at. */
  mediaUrl: (key: string) => string;
  save: () => Promise<boolean>;
}

export function useEditor(initial: ContentSet, initialMedia: MediaInfo[]): Editor {
  const [content, setContent] = useState(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  /** Keys already in the bucket, so a preview knows whether to expect bytes. */
  const known = useRef(new Set(initialMedia.map((entry) => entry.key)));
  /** Bumped on every upload so a replaced photograph is re-fetched, not cached. */
  const [version, setVersion] = useState(0);

  const update = useCallback(<K extends keyof ContentSet>(key: K, value: ContentSet[K]) => {
    setContent((current) => ({ ...current, [key]: value }));
    setDirty(true);
  }, []);

  const putMedia = useCallback(async (key: string, file: File): Promise<void> => {
    setUploading(true);
    setError(null);
    try {
      await mediaService.upload(key, await prepareImage(file));
      known.current.add(key);
      setVersion((current) => current + 1);
    } finally {
      setUploading(false);
    }
  }, []);

  const mediaUrl = useCallback((key: string) => mediaService.url(key, version), [version]);

  const problems = useMemo(() => checkContent(content), [content]);

  const save = useCallback(async (): Promise<boolean> => {
    if (!dirty || problems.length > 0) return false;
    setSaving(true);
    setError(null);

    try {
      await contentService.save(content);
      setDirty(false);
      return true;
    } catch (failure) {
      // A 422 means the server's copy of the rules caught something the form's
      // copy did not, which is a bug worth seeing rather than a generic failure.
      setError(
        failure instanceof ApiError && failure.problems !== undefined
          ? `${failure.message} (${failure.problems[0]?.label ?? 'unknown field'})`
          : failure instanceof Error
            ? failure.message
            : 'The save failed.',
      );
      return false;
    } finally {
      setSaving(false);
    }
  }, [content, dirty, problems.length]);

  return {
    content,
    problems,
    dirty,
    saving,
    uploading,
    error,
    update,
    putMedia,
    mediaUrl,
    save,
  };
}
