/**
 * One photograph, with the description it is not allowed to go without.
 *
 * The alt text sits in the same box as the picture on purpose. CLAUDE.md §10
 * makes alt a required field so it cannot be forgotten; putting it anywhere but
 * next to the image it describes is how it gets forgotten anyway. The database
 * now refuses a half-filled one too, so this is the first of two gates rather
 * than the only one.
 */
import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { emptyLocalised, type ImageRef } from '../content/types';
import { mediaKey } from '../images';
import { LocalisedField } from './fields';

interface ImageFieldProps {
  label: string;
  value: ImageRef;
  onChange: (value: ImageRef) => void;
  /** Where a newly chosen file should be filed — "works/salt-and-scaffold". */
  folder: string;
  /** The file's stem, without extension — "cover", "01", "shen-zhibai". */
  name: string;
  mediaUrl: (key: string) => string;
  onUpload: (key: string, file: File) => Promise<void>;
}

export function ImageField({
  label,
  value,
  onChange,
  folder,
  name,
  mediaUrl,
  onUpload,
}: ImageFieldProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);

  const decorative = value.alt === '';

  async function choose(file: File | undefined): Promise<void> {
    if (file === undefined) return;
    setBusy(true);
    setFailure(null);
    try {
      // Uploaded before the record points at it: the content's foreign key
      // means the photograph has to exist first.
      const key = mediaKey(folder, name);
      await onUpload(key, file);
      onChange({ ...value, src: key });
    } catch (error) {
      setFailure(error instanceof Error ? error.message : 'That image could not be uploaded.');
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
            <span className="image-empty">{t('common.noImage')}</span>
          ) : (
            <img src={mediaUrl(value.src)} alt="" loading="lazy" />
          )}
        </div>

        <div className="image-controls">
          <label className="button">
            {value.src === '' ? t('common.choosePhoto') : t('common.replace')}
            <input
              type="file"
              accept="image/jpeg,image/png"
              className="visually-hidden"
              disabled={busy}
              onChange={(event) => void choose(event.target.files?.[0])}
            />
          </label>
          {busy && <p className="field-hint">{t('common.uploading')}</p>}
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
          {t('common.decorative')}
        </span>
      </label>

      {!decorative && (
        <LocalisedField
          label={t('common.imageDescription')}
          value={value.alt === '' ? emptyLocalised() : value.alt}
          onChange={(alt) => onChange({ ...value, alt })}
          hint={t('common.imageHint')}
        />
      )}
    </section>
  );
}
