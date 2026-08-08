/**
 * One photograph, with the description it is not allowed to go without.
 *
 * The alt text sits in the same box as the picture on purpose. CLAUDE.md §10
 * makes alt a required field so it cannot be forgotten; putting it anywhere but
 * next to the image it describes is how it gets forgotten anyway.
 */
import { useState } from 'react';

import { emptyLocalised, type ImageRef } from '../content/types';
import { mediaPath, prepareImage } from '../images';
import type { PendingMedia } from '../useEditor';
import { LocalisedField } from './fields';

interface ImageFieldProps {
  label: string;
  value: ImageRef;
  onChange: (value: ImageRef) => void;
  /** Where a newly chosen file should land, relative to media-source. */
  folder: string;
  /** The file's stem, without extension — "cover", "01", "shen-zhibai". */
  name: string;
  mediaUrl: (src: string) => string;
  onStage: (media: PendingMedia) => void;
}

export function ImageField({
  label,
  value,
  onChange,
  folder,
  name,
  mediaUrl,
  onStage,
}: ImageFieldProps) {
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const decorative = value.alt === '';

  async function choose(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setBusy(true);
    setFailure(null);
    try {
      const prepared = await prepareImage(file);
      const src = mediaPath(folder, name);
      onStage({
        path: `media-source/${src}`,
        base64: prepared.base64,
        objectUrl: URL.createObjectURL(
          new Blob([Uint8Array.from(atob(prepared.base64), (c) => c.charCodeAt(0))], {
            type: 'image/jpeg',
          }),
        ),
      });
      onChange({ ...value, src });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That image could not be read.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="image-field">
      <h4 className="field-label">{label}</h4>

      <div className="image-row">
        <div className="image-preview">
          {value.src === '' ? (
            <span className="image-empty">No image</span>
          ) : (
            <img src={mediaUrl(value.src)} alt="" loading="lazy" />
          )}
        </div>

        <div className="image-controls">
          <label className="button">
            {value.src === '' ? 'Choose a photograph' : 'Replace'}
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="visually-hidden"
              disabled={busy}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          {busy && <p className="field-hint">Resizing…</p>}
          {failure !== null && <p className="problem">{failure}</p>}
          {value.src !== '' && <p className="field-hint image-path">{value.src}</p>}
        </div>
      </div>

      <label className="checkbox">
        <input
          type="checkbox"
          checked={decorative}
          onChange={(event) =>
            onChange({ ...value, alt: event.target.checked ? '' : emptyLocalised() })
          }
        />
        <span>
          Decorative — this photograph carries no information a description would need to
          repeat
        </span>
      </label>

      {!decorative && (
        <LocalisedField
          label="Description, for anyone who cannot see it"
          value={value.alt === '' ? emptyLocalised() : value.alt}
          onChange={(alt) => onChange({ ...value, alt })}
          hint="Say what is in the photograph, not that it is a photograph."
        />
      )}
    </section>
  );
}
