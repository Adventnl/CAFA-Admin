/**
 * The vocabulary a connector describes its answer in.
 *
 * This is JSON Schema, narrowed to the handful of keywords the content actually
 * uses, and it exists so that api.json is *compiled* rather than written by
 * hand. A hand-written OpenAPI file is a second copy of the truth that drifts
 * the first time a field is renamed; these builders let a connector declare its
 * shape beside its reader, in the same object, so the two cannot disagree
 * without a TypeScript error.
 *
 * The component schemas below mirror src/content/types.ts as the *published*
 * bundle carries it — which is not quite the editable content set, and the
 * differences are deliberate. worker/domain/bundle.ts adds `url`, `locales`
 * and `localeNames` to `site`, lifts `localeName` out of each dictionary, and
 * empties a private work's cover and media. What is written here is what a
 * client will actually receive.
 */
import { PAGE_SECTION_KINDS } from '../domain/bundle';

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean' | 'null';
  description?: string;
  properties?: Record<string, JsonSchema>;
  required?: readonly string[];
  items?: JsonSchema;
  enum?: readonly string[];
  const?: string;
  additionalProperties?: JsonSchema | boolean;
  anyOf?: readonly JsonSchema[];
  $ref?: string;
}

/** A named schema in `components`, referenced rather than repeated. */
export function ref(name: string): JsonSchema {
  return { $ref: `#/components/schemas/${name}` };
}

export function text(description: string): JsonSchema {
  return { type: 'string', description };
}

export function whole(description: string): JsonSchema {
  return { type: 'integer', description };
}

export function flag(description: string): JsonSchema {
  return { type: 'boolean', description };
}

/**
 * A number, or null where there is nothing to measure.
 *
 * Written as an `anyOf` rather than a nullable number because the document is
 * OpenAPI 3.1, which is JSON Schema — `null` is a type there, and `nullable:`
 * is the 3.0 spelling that no longer exists. One shape uses it: a photograph's
 * hue, which a monochrome image genuinely does not have.
 */
export function maybeNumber(description: string): JsonSchema {
  return { anyOf: [{ type: 'number' }, { type: 'null' }], description };
}

export function choice(values: readonly string[], description: string): JsonSchema {
  return { type: 'string', enum: values, description };
}

export function list(items: JsonSchema, description: string): JsonSchema {
  return { type: 'array', items, description };
}

/** An object whose keys are data — a dictionary of media keys, say. */
export function map(values: JsonSchema, description: string): JsonSchema {
  return { type: 'object', additionalProperties: values, description };
}

/**
 * An object, every property of which is present.
 *
 * That is the honest default here rather than laziness: the admin refuses a
 * save with a blank in it, both columns of every localised field are NOT NULL,
 * and the bundle is built by projection rather than by merge — so a client can
 * rely on every field below existing. The one shape that genuinely varies is a
 * nav item, and it says so with `some`.
 */
export function shape(properties: Record<string, JsonSchema>, description?: string): JsonSchema {
  return {
    type: 'object',
    ...(description === undefined ? {} : { description }),
    properties,
    required: Object.keys(properties),
  };
}

/** An object where only some properties are guaranteed. */
export function some(
  properties: Record<string, JsonSchema>,
  required: readonly string[],
  description?: string,
): JsonSchema {
  return {
    type: 'object',
    ...(description === undefined ? {} : { description }),
    properties,
    required,
  };
}

/** A group of copy keys, all of them plain strings in one language. */
function words(entries: Record<string, string>): JsonSchema {
  return shape(Object.fromEntries(Object.entries(entries).map(([key, note]) => [key, text(note)])));
}

/**
 * Everything `components.schemas` holds.
 *
 * Named rather than inlined so a generated client gets `Work` and `Mentor` as
 * types instead of eleven anonymous objects, and so the same schema under two
 * connectors is provably the same schema.
 */
export const COMPONENTS: Record<string, JsonSchema> = {
  LocalisedText: shape(
    { zh: text('The Chinese text.'), en: text('The English text.') },
    'Both languages, always. Neither can be blank — the editor refuses the save.',
  ),

  Image: shape(
    {
      src: text('The object key, e.g. "works/edible-house/01.jpg". Append it to `mediaBase`.'),
      alt: {
        anyOf: [ref('LocalisedText'), { type: 'string', const: '' }],
        description:
          'The description, in both languages. The empty string is not an omission: it is how a photograph that carries no information is declared decorative.',
      },
    },
    'A photograph, as content refers to it. The bytes are served from the media origin, not from this API.',
  ),

  Credit: shape({
    role: ref('LocalisedText'),
    name: ref('LocalisedText'),
  }),

  Work: shape(
    {
      slug: text('Stable id, and the last segment of the work’s URL on the site.'),
      index: whole('Where it sits in the studio’s own numbering of the works.'),
      title: ref('LocalisedText'),
      status: choice(['completed', 'in-progress', 'private'], 'What state the work is in.'),
      discipline: list(ref('LocalisedText'), 'One or more disciplines the work belongs to.'),
      year: whole('The year the work is dated to.'),
      summary: ref('LocalisedText'),
      credits: list(ref('Credit'), 'Who did what, in the studio’s own wording.'),
      cover: ref('Image'),
      media: list(ref('Image'), 'The photographs of the work, in the order they are shown.'),
    },
    'A private work is listed and has no page: its `cover.src` is the empty string and its `media` is empty, because those photographs are dropped before a revision is written and no URL for them ever leaves the database.',
  ),

  Program: shape({
    slug: text('Stable id.'),
    name: ref('LocalisedText'),
    audience: ref('LocalisedText'),
    duration: ref('LocalisedText'),
    summary: ref('LocalisedText'),
  }),

  Mentor: shape({
    slug: text('Stable id.'),
    name: ref('LocalisedText'),
    discipline: ref('LocalisedText'),
    note: ref('LocalisedText'),
    portrait: ref('Image'),
  }),

  PageSection: some(
    {
      kind: choice(PAGE_SECTION_KINDS, 'What this block is. Each kind is one component on the site.'),
      text: ref('LocalisedText'),
      paragraphs: list(ref('LocalisedText'), 'One entry per paragraph. Present on `prose`.'),
      images: list(ref('Image'), 'The photographs, in order. Present on `gallery`.'),
    },
    ['kind'],
    'One block on a page. Only `kind` is always present: `text` comes with `statement`, `works-grid` and `mentors`, `paragraphs` with `prose`, `images` with `gallery`, and `heading`, `works-index` and `programs` carry none of them — they draw the page’s own title, the works and the programmes respectively.',
  ),

  Page: shape(
    {
      slug: text('The single path segment under the locale. The empty string is the front page, served at the locale’s own address.'),
      title: ref('LocalisedText'),
      description: ref('LocalisedText'),
      navLabel: {
        anyOf: [ref('LocalisedText'), { type: 'null' }],
        description: 'The word in the navigation bar, or null for a page the bar does not carry.',
      },
      sections: list(ref('PageSection'), 'The blocks of the page, top to bottom.'),
    },
    'One page of the site. The set of pages *is* this array — there is one route behind all of them — and the navigation bar is the pages that carry a `navLabel`, in this order.',
  ),

  Site: shape(
    {
      name: ref('LocalisedText'),
      url: text('The public site’s origin, without a trailing slash.'),
      locales: list(text('A locale code.'), 'Every language the site is published in.'),
      localeNames: shape(
        { zh: text('What Chinese calls itself in the switch.'), en: text('And English.') },
        'What each language calls itself, in itself.',
      ),
      contact: shape({
        email: text('The studio’s address for enquiries.'),
        wechat: text('The WeChat id.'),
        address: ref('LocalisedText'),
        hours: ref('LocalisedText'),
      }),
    },
    'The studio itself: who it is and where it is. The navigation is not here — it is the pages that carry a `navLabel`, in `pages` order.',
  ),

  Dictionary: shape(
    {
      meta: words({
        title: 'The default document title.',
        titleTemplate: 'How a page title is composed. Contains a placeholder.',
        description: 'The default meta description.',
      }),
      a11y: words({
        skipToContent: 'The skip link.',
        primaryNav: 'The label on the main navigation landmark.',
        localeSwitch: 'The label on the language switch.',
        worksList: 'The label on the works list.',
        worksRail: 'The label on the works rail.',
        workPager: 'The label on the previous/next pager.',
        close: 'The label on a close button.',
      }),
      works: shape({
        status: words({
          completed: 'What "completed" is called.',
          'in-progress': 'What "in-progress" is called.',
          private: 'What "private" is called.',
        }),
      }),
      work: words({
        index: 'The label before a work’s number.',
        status: 'The label before its status.',
        year: 'The label before its year.',
        discipline: 'The label before its disciplines.',
        credits: 'The heading above the credits.',
        previous: 'The pager’s backward label.',
        next: 'The pager’s forward label.',
      }),
      contact: words({
        nav: 'The word in the navigation bar that opens the panel.',
        title: 'The heading of the contact panel.',
        email: 'The label before the email address.',
        wechat: 'The label before the WeChat id.',
        address: 'The label before the address.',
        hours: 'The label before the opening hours.',
        note: 'The line under them.',
        from: 'The label on the message form’s address field.',
        message: 'The label on its message field.',
        subject: 'The subject line the reader’s own mail client opens with.',
        send: 'The word on its button.',
      }),
      notFound: words({
        title: 'The 404 heading.',
        body: 'What it says.',
        home: 'The label on its way out.',
      }),
      footer: words({ note: 'The line in the footer.' }),
    },
    'The words on the chrome — everything that is not a page, a work, a programme or a mentor — for one language. A page’s title, its prose and the headings over its sections are on the page record, because they belong to a page that can be deleted; these outlive every page. The navigation labels are on the pages, except Contact’s, which is here because the panel it opens is not a page.',
  ),

  Photograph: shape(
    {
      key: text('The object key, which is what content refers to a photograph by.'),
      url: text('The absolute URL of the original. Transform it when `Bundle.mediaTransform` is true; otherwise point an `<img src>` straight at it.'),
      width: whole('The intrinsic width in pixels, measured from the file on upload.'),
      height: whole('The intrinsic height, likewise. Together they are the aspect box.'),
      tint: maybeNumber(
        'The dominant hue in degrees on the OKLCH colour circle, [0, 360). Null when the photograph has no hue to give — it is monochrome, or it predates the measurement.',
      ),
      alt: {
        anyOf: [ref('LocalisedText'), { type: 'string', const: '' }],
        description: 'The description in both languages, or the empty string when decorative.',
      },
      decorative: flag('True when there is no alt text because there is nothing to describe.'),
      usedBy: text('What cites it: "work:<slug>", "mentor:<slug>" or "studio".'),
    },
    'One published photograph, with everything needed to lay it out before it loads.',
  ),

  Bundle: shape(
    {
      site: ref('Site'),
      pages: list(ref('Page'), 'Every page, in the studio’s order — which is also the order of the navigation bar.'),
      works: list(ref('Work'), 'Every work, in index order.'),
      programs: list(ref('Program'), 'Every programme.'),
      mentors: list(ref('Mentor'), 'Every mentor.'),
      dictionaries: shape(
        { zh: ref('Dictionary'), en: ref('Dictionary') },
        'The site’s words, one dictionary per language.',
      ),
      media: map(
        shape({
          width: whole('Intrinsic width.'),
          height: whole('Intrinsic height.'),
          tint: maybeNumber('Dominant hue in OKLCH degrees, or null where there is none.'),
        }),
        'What was measured, by object key, for every photograph public content cites.',
      ),
      mediaBase: text('The origin the photographs are served from.'),
      mediaTransform: flag(
        'Whether photographs may be requested through `/cdn-cgi/image/…` on the site’s own zone. False means the zone cannot transform and the originals must be rendered as they are — the URLs in `mediaBase` still resolve, they are simply full size.',
      ),
    },
    'The whole published revision in one answer — the same projection the site’s own build reads.',
  ),

  Error: shape(
    {
      success: flag('Always false. This is the admin’s failure envelope.'),
      data: { description: 'Always null on a failure.' },
      code: whole('Mirrors the HTTP status.'),
      msg: text('What went wrong, in a sentence that can be shown to a person.'),
    },
    'What a connector answers with when it cannot answer. A successful read never has this shape.',
  ),
};
