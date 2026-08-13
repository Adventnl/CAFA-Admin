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
 * differences are deliberate. worker/domain/bundle.ts adds `url`, `locales`,
 * `localeNames` and `nav` to `site`, lifts `nav` and `localeName` out of each
 * dictionary, and empties a private work's cover and media. What is written
 * here is what a client will actually receive.
 */
import { NAV_PANELS, NAV_ROUTES } from '../domain/bundle';

export interface JsonSchema {
  type?: 'object' | 'array' | 'string' | 'integer' | 'number' | 'boolean';
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

  NavItem: some(
    {
      label: ref('LocalisedText'),
      route: choice(NAV_ROUTES, 'The page this item leads to. Present unless `opens` is.'),
      opens: choice(NAV_PANELS, 'A panel this item opens in place. Present unless `route` is.'),
    },
    ['label'],
    'One item of the site’s navigation. Its order and destination are wired to the site’s code; only the label is editable.',
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
      nav: list(ref('NavItem'), 'The navigation, in order.'),
      studio: list(ref('Image'), 'Photographs of the studio.'),
      contact: shape({
        email: text('The studio’s address for enquiries.'),
        wechat: text('The WeChat id.'),
        address: ref('LocalisedText'),
        hours: ref('LocalisedText'),
      }),
    },
    'The studio itself: who it is, where it is, and the chrome around every page.',
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
      home: words({ statement: 'The statement on the front page.', worksLink: 'Its one link.' }),
      works: shape({
        title: text('The works page heading.'),
        description: text('Its meta description.'),
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
      programs: words({
        title: 'The programmes page heading.',
        description: 'Its meta description.',
        intro: 'The paragraph above the list.',
      }),
      about: shape({
        title: text('The about page heading.'),
        description: text('Its meta description.'),
        body: list(text('One paragraph.'), 'The about text, one entry per paragraph.'),
        studioTitle: text('The heading above the studio photographs.'),
        mentorsTitle: text('The heading above the mentors.'),
      }),
      contact: words({
        title: 'The heading of the contact panel.',
        email: 'The label before the email address.',
        wechat: 'The label before the WeChat id.',
        address: 'The label before the address.',
        hours: 'The label before the opening hours.',
        note: 'The line under them.',
      }),
      notFound: words({
        title: 'The 404 heading.',
        body: 'What it says.',
        home: 'The label on its way out.',
      }),
      footer: words({ note: 'The line in the footer.' }),
    },
    'Every word on the site that is not a work, a programme or a mentor — for one language. The navigation labels are not here: they are in `site.nav`, because they belong to the chrome.',
  ),

  Photograph: shape(
    {
      key: text('The object key, which is what content refers to a photograph by.'),
      url: text('The absolute URL of the original. Point an `<img src>` at it, or transform it.'),
      width: whole('The intrinsic width in pixels, measured from the file on upload.'),
      height: whole('The intrinsic height, likewise. Together they are the aspect box.'),
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
      works: list(ref('Work'), 'Every work, in index order.'),
      programs: list(ref('Program'), 'Every programme.'),
      mentors: list(ref('Mentor'), 'Every mentor.'),
      dictionaries: shape(
        { zh: ref('Dictionary'), en: ref('Dictionary') },
        'The site’s words, one dictionary per language.',
      ),
      media: map(
        shape({ width: whole('Intrinsic width.'), height: whole('Intrinsic height.') }),
        'Dimensions by object key, for every photograph public content cites.',
      ),
      mediaBase: text('The origin the photographs are served from.'),
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
