/**
 * The form vocabulary. Six components, all controlled, all labelled.
 *
 * `LocalisedField` is the important one: it puts Chinese and English side by
 * side on every piece of copy, so writing only one of them is a visible gap
 * rather than something discovered at build time.
 */
import type { ReactNode } from 'react';
import { useId } from 'react';

import { LOCALES, type LocalisedText, type Locale } from '../content/types';

const LOCALE_NAMES: Record<Locale, string> = { zh: '中文', en: 'English' };

interface FieldProps {
  label: string;
  hint?: string;
  children: ReactNode;
}

export function Field({ label, hint, children }: FieldProps) {
  return (
    <div className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface TextProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  hint?: string;
  multiline?: boolean;
  placeholder?: string;
  inputMode?: 'text' | 'numeric' | 'email' | 'url';
}

export function TextField({
  label,
  value,
  onChange,
  hint,
  multiline = false,
  placeholder,
  inputMode = 'text',
}: TextProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      {multiline ? (
        <textarea
          id={id}
          className="input"
          rows={4}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      ) : (
        <input
          id={id}
          className="input"
          type="text"
          inputMode={inputMode}
          value={value}
          placeholder={placeholder}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface NumberProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
  hint?: string;
}

export function NumberField({ label, value, onChange, hint }: NumberProps) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <input
        id={id}
        className="input input-narrow"
        type="number"
        value={Number.isFinite(value) ? value : ''}
        onChange={(event) => onChange(event.target.valueAsNumber)}
      />
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface LocalisedProps {
  label: string;
  value: LocalisedText;
  onChange: (value: LocalisedText) => void;
  hint?: string;
  multiline?: boolean;
}

export function LocalisedField({ label, value, onChange, hint, multiline }: LocalisedProps) {
  return (
    <fieldset className="field localised">
      <legend className="field-label">{label}</legend>
      <div className="localised-pair">
        {LOCALES.map((locale) => (
          <TextField
            key={locale}
            label={LOCALE_NAMES[locale]}
            value={value[locale] ?? ''}
            multiline={multiline}
            onChange={(next) => onChange({ ...value, [locale]: next })}
          />
        ))}
      </div>
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </fieldset>
  );
}

interface SelectProps<T extends string> {
  label: string;
  value: T;
  options: readonly { value: T; label: string }[];
  onChange: (value: T) => void;
  hint?: string;
}

export function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  hint,
}: SelectProps<T>) {
  const id = useId();
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <select
        id={id}
        className="input input-narrow"
        value={value}
        onChange={(event) => {
          const chosen = options.find((option) => option.value === event.target.value);
          if (chosen !== undefined) onChange(chosen.value);
        }}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
      {hint !== undefined && <p className="field-hint">{hint}</p>}
    </div>
  );
}

interface RepeatableProps {
  label: string;
  count: number;
  addLabel: string;
  onAdd: () => void;
  onRemove: (at: number) => void;
  onMove: (at: number, to: number) => void;
  renderItem: (at: number) => ReactNode;
  hint?: string;
}

/**
 * Reordering is buttons rather than drag: it works with a keyboard, works on a
 * phone, and needs no library. The lists here are five to ten items long, which
 * is well inside what buttons handle gracefully.
 */
export function Repeatable({
  label,
  count,
  addLabel,
  onAdd,
  onRemove,
  onMove,
  renderItem,
  hint,
}: RepeatableProps) {
  return (
    <section className="repeatable">
      <header className="repeatable-head">
        <h3 className="repeatable-title">{label}</h3>
        <button type="button" className="button" onClick={onAdd}>
          {addLabel}
        </button>
      </header>
      {hint !== undefined && <p className="field-hint">{hint}</p>}

      {count === 0 ? (
        <p className="empty">Nothing here yet.</p>
      ) : (
        <ol className="repeatable-list">
          {Array.from({ length: count }, (_, at) => (
            <li key={at} className="repeatable-item">
              <div className="repeatable-body">{renderItem(at)}</div>
              <div className="repeatable-controls">
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={at === 0}
                  aria-label={`Move ${label} ${at + 1} up`}
                  onClick={() => onMove(at, at - 1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  className="button button-quiet"
                  disabled={at === count - 1}
                  aria-label={`Move ${label} ${at + 1} down`}
                  onClick={() => onMove(at, at + 1)}
                >
                  ↓
                </button>
                <button
                  type="button"
                  className="button button-quiet button-danger"
                  aria-label={`Remove ${label} ${at + 1}`}
                  onClick={() => onRemove(at)}
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

/** Moving an item within an array, which every Repeatable needs. */
export function moved<T>(items: T[], at: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  const [item] = next.splice(at, 1);
  if (item === undefined) return items;
  next.splice(to, 0, item);
  return next;
}
