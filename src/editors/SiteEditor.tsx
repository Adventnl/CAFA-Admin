/**
 * The studio itself: what it is called, how to reach it, and the photographs
 * the home page carries below the fold.
 *
 * `nav`, `locales` and `url` are deliberately not here. They are wired to
 * lib/routes and to the deployment, and changing one of them is a code change
 * with a deploy behind it — not something to expose on a form that says "save".
 */
import { emptyLocalised, type ImageRef, type SiteContent } from '../content/types';
import { nextMediaName } from '../images';
import type { Editor } from '../useEditor';
import { LocalisedField, moved, Repeatable, TextField } from '../ui/fields';
import { ImageField } from '../ui/ImageField';

interface SiteEditorProps {
  editor: Editor;
}

export function SiteEditor({ editor }: SiteEditorProps) {
  const site = editor.content.site;

  const set = <K extends keyof SiteContent>(key: K, value: SiteContent[K]) =>
    editor.update('site', { ...site, [key]: value });

  const setContact = (patch: Partial<SiteContent['contact']>) =>
    set('contact', { ...site.contact, ...patch });

  const blankStudio = (): ImageRef => ({ src: '', alt: emptyLocalised() });

  return (
    <section>
      <header className="section-head">
        <h2>Studio &amp; contact</h2>
      </header>

      <LocalisedField label="Studio name" value={site.name} onChange={(name) => set('name', name)} />

      <TextField
        label="Email"
        value={site.contact.email}
        onChange={(email) => setContact({ email })}
        inputMode="email"
      />
      <TextField
        label="WeChat"
        value={site.contact.wechat}
        onChange={(wechat) => setContact({ wechat })}
      />
      <LocalisedField
        label="Address"
        value={site.contact.address}
        onChange={(address) => setContact({ address })}
      />
      <LocalisedField
        label="Opening hours"
        value={site.contact.hours}
        onChange={(hours) => setContact({ hours })}
      />

      <Repeatable
        label="Studio photograph"
        count={site.studio.length}
        addLabel="Add a photograph"
        hint="These run down the home page below the statement, and across the about page."
        onAdd={() => set('studio', [...site.studio, blankStudio()])}
        onRemove={(at) =>
          set(
            'studio',
            site.studio.filter((_, position) => position !== at),
          )
        }
        onMove={(at, to) => set('studio', moved(site.studio, at, to))}
        renderItem={(at) => {
          const image = site.studio[at];
          if (image === undefined) return null;
          return (
            <ImageField
              label={`Studio photograph ${at + 1}`}
              value={image}
              onChange={(value) =>
                set(
                  'studio',
                  site.studio.map((existing, position) => (position === at ? value : existing)),
                )
              }
              folder="studio"
              name={
                image.src === ''
                  ? nextMediaName(
                      site.studio.map((entry) => entry.src),
                      '',
                    )
                  : (image.src.split('/').pop() ?? '').replace(/\.[^.]+$/, '')
              }
              mediaUrl={editor.mediaUrl}
              onUpload={editor.putMedia}
            />
          );
        }}
      />
    </section>
  );
}
