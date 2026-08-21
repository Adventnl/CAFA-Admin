/**
 * The studio itself: what it is called and how to reach it.
 *
 * `locales` and `url` are deliberately not here. They are wired to lib/routes
 * and to the deployment, and changing one of them is a code change with a
 * deploy behind it — not something to expose on a form that says "save".
 *
 * The studio photographs are not here either, and that is the change rather
 * than an omission: they are a `gallery` section on the front page now, so they
 * are added, reordered and removed in Pages beside everything else on it. One
 * list, one owner.
 */
import type { SiteContent } from '../content/types';
import { useTranslation } from 'react-i18next';
import type { Editor } from '../useEditor';
import { LocalisedField, TextField } from '../ui/fields';

interface SitePageProps {
  editor: Editor;
}

export function SitePage({ editor }: SitePageProps) {
  const { t } = useTranslation();
  const site = editor.content.site;

  const set = <K extends keyof SiteContent>(key: K, value: SiteContent[K]) =>
    editor.update('site', { ...site, [key]: value });

  const setContact = (patch: Partial<SiteContent['contact']>) =>
    set('contact', { ...site.contact, ...patch });

  return (
    <section>
      <header className="section-head">
        <h2>{t('pages.site')}</h2>
      </header>

      <LocalisedField label={t('fields.studioName')} value={site.name} onChange={(name) => set('name', name)} />

      <TextField
        label={t('fields.email')}
        value={site.contact.email}
        onChange={(email) => setContact({ email })}
        inputMode="email"
      />
      <TextField
        label={t('fields.wechat')}
        value={site.contact.wechat}
        onChange={(wechat) => setContact({ wechat })}
      />
      <LocalisedField
        label={t('fields.address')}
        value={site.contact.address}
        onChange={(address) => setContact({ address })}
      />
      <LocalisedField
        label={t('fields.hours')}
        value={site.contact.hours}
        onChange={(hours) => setContact({ hours })}
      />

    </section>
  );
}
