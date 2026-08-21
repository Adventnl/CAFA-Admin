/**
 * Every connector there is.
 *
 * This list is the whole of the public read API. It is also, and this is the
 * reason it looks the way it does, the source api.json is compiled from — so
 * the document a frontend hands to its code generator cannot describe a route
 * that does not exist, or miss one that does.
 *
 * Everything here reads the newest *published* revision. Not the draft: an
 * unpublished edit is exactly what should not be visible from outside, and the
 * one endpoint that serves the draft has always required the preview build's
 * token. So a connector answers what is on the public site, which is also what
 * makes it safe to answer it to anyone.
 *
 * To add one: append it below. The route registers itself in worker/index.ts,
 * the document grows an entry, the dev panel grows a card.
 */
import { LOCALES, WORK_STATUSES, type ImageRef, type Work } from '../../src/content/types';
import { ApiException } from '../shared/api-exception';
import type { Connector, ConnectorGroup, ReadableBundle } from './connector';
import { list, ref, shape, text, whole } from './schema';

/** Bumped when a connector's answer changes shape in a way a client would feel. */
export const API_VERSION = '2.0.0';

/** Where the compiled document is served. */
export const DOCUMENT_PATH = '/api.json';

export const GROUPS: readonly ConnectorGroup[] = [
  {
    name: 'Site',
    description:
      'The studio itself, its pages, and how fresh what you are reading is. Start here: `/api/v1/pages` is the site’s structure — every page, in order, each a list of blocks — and `/api/v1/site` carries the studio’s details, the locales and the media origin.',
  },
  {
    name: 'Works',
    description:
      'The works, as the index lists them and as a single page shows one. A private work appears in the list with no photographs at all.',
  },
  {
    name: 'Programmes',
    description: 'The teaching programmes, in the order the studio keeps them in.',
  },
  { name: 'Mentors', description: 'The people, and their portraits.' },
  {
    name: 'Text',
    description:
      'Every word on the site that is not a work, a programme or a mentor — one dictionary per language.',
  },
  {
    name: 'Photographs',
    description:
      'Where the pictures are, how big they are and what colour they are. The bytes are served from the media origin rather than through this API, so an `<img src>` points straight at the CDN and nothing is proxied.',
  },
  {
    name: 'Everything',
    description: 'The whole revision in one request, for a build that would rather not make eight.',
  },
];

export const CONNECTORS: readonly Connector[] = [
  {
    id: 'getSite',
    group: 'Site',
    path: '/api/v1/site',
    summary: 'The studio, its origin and its locales',
    description:
      'The chrome around every page: the studio’s name and contact details, the site’s own origin and the languages it is published in. The navigation is not here — it is `/api/v1/pages`, filtered to the pages that carry a `navLabel`, in that order.',
    returns: ref('Site'),
    read: ({ bundle }) => bundle.site,
  },

  {
    id: 'listPages',
    group: 'Site',
    path: '/api/v1/pages',
    summary: 'Every page, in order',
    description:
      'The structure of the site: one entry per page, each a slug, the words that name it and an ordered list of the blocks it is made of. This *is* the set of pages — there is one route behind all of them — so a page added here is a URL and a page removed is not one. The navigation bar is this list filtered to the entries with a `navLabel`, in this order.',
    returns: list(ref('Page'), 'The pages, in the studio’s order.'),
    read: ({ bundle }) => bundle.pages,
  },

  {
    id: 'getPage',
    group: 'Site',
    path: '/api/v1/pages/:slug',
    summary: 'One page',
    description:
      'A single page by its slug. The front page has none — its address is the locale’s own — so ask for it as `-`, which is the one spelling an empty path segment has.',
    params: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        description: 'The page’s slug, or `-` for the front page.',
        example: 'about',
      },
    ],
    returns: ref('Page'),
    read: ({ bundle }, { params }) => {
      const asked = params.slug ?? '';
      const slug = asked === '-' ? '' : asked;
      const page = bundle.pages.find((candidate) => candidate.slug === slug);
      if (page === undefined) throw ApiException.notFound(`No page called ${asked}.`);
      return page;
    },
  },

  {
    id: 'getRevision',
    group: 'Site',
    path: '/api/v1/revision',
    summary: 'Which snapshot you are reading',
    description:
      'The number of the newest published revision and when it went live. Every other connector returns this same number alongside its data, so this endpoint is for the case where the number is all you want — a poll that decides whether to refetch anything at all.',
    returns: shape({
      revision: whole('The newest published revision.'),
      publishedAt: text('When it was published, UTC, as "YYYY-MM-DD HH:MM:SS".'),
    }),
    read: ({ revision, publishedAt }) => ({ revision, publishedAt }),
  },

  {
    id: 'listWorks',
    group: 'Works',
    path: '/api/v1/works',
    summary: 'Every work',
    description:
      'The index, in the studio’s own numbering. A private work is included — it is listed on the site — but its cover and its photographs are empty, because they are dropped before a revision is written.',
    params: [
      {
        name: 'status',
        in: 'query',
        required: false,
        description: 'Keep only works in this state.',
        example: 'completed',
        values: WORK_STATUSES,
      },
    ],
    returns: list(ref('Work'), 'The works, in index order.'),
    read: ({ bundle }, { query }) => {
      const status = query.get('status');
      const works = [...bundle.works].sort((a, b) => a.index - b.index);
      if (status === null || status === '') return works;

      if (!WORK_STATUSES.includes(status as Work['status'])) {
        throw ApiException.badRequest(`Not a work status: ${status}.`);
      }
      return works.filter((work) => work.status === status);
    },
  },

  {
    id: 'getWork',
    group: 'Works',
    path: '/api/v1/works/:slug',
    summary: 'One work',
    description:
      'A single work by its slug, in the same shape the index carries. Answers 404 for a slug that is not published — including one that exists in the draft and has not been published yet.',
    params: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        description: 'The work’s slug, as the index gives it.',
        example: 'edible-house',
      },
    ],
    returns: ref('Work'),
    read: ({ bundle }, { params }) => {
      const slug = params.slug ?? '';
      const work = bundle.works.find((candidate) => candidate.slug === slug);
      if (work === undefined) throw ApiException.notFound(`No published work called ${slug}.`);
      return work;
    },
  },

  {
    id: 'listPrograms',
    group: 'Programmes',
    path: '/api/v1/programs',
    summary: 'Every programme',
    description: 'The teaching programmes, in the order the studio keeps them in.',
    returns: list(ref('Program'), 'The programmes.'),
    read: ({ bundle }) => bundle.programs,
  },

  {
    id: 'getProgram',
    group: 'Programmes',
    path: '/api/v1/programs/:slug',
    summary: 'One programme',
    description: 'A single programme by its slug.',
    params: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        description: 'The programme’s slug.',
        example: 'summer-atelier',
      },
    ],
    returns: ref('Program'),
    read: ({ bundle }, { params }) => {
      const slug = params.slug ?? '';
      const program = bundle.programs.find((candidate) => candidate.slug === slug);
      if (program === undefined) throw ApiException.notFound(`No programme called ${slug}.`);
      return program;
    },
  },

  {
    id: 'listMentors',
    group: 'Mentors',
    path: '/api/v1/mentors',
    summary: 'Every mentor',
    description: 'The people, each with the portrait a `mentors` block draws.',
    returns: list(ref('Mentor'), 'The mentors.'),
    read: ({ bundle }) => bundle.mentors,
  },

  {
    id: 'getMentor',
    group: 'Mentors',
    path: '/api/v1/mentors/:slug',
    summary: 'One mentor',
    description: 'A single mentor by their slug.',
    params: [
      {
        name: 'slug',
        in: 'path',
        required: true,
        description: 'The mentor’s slug.',
        example: 'shen-zhibai',
      },
    ],
    returns: ref('Mentor'),
    read: ({ bundle }, { params }) => {
      const slug = params.slug ?? '';
      const mentor = bundle.mentors.find((candidate) => candidate.slug === slug);
      if (mentor === undefined) throw ApiException.notFound(`No mentor called ${slug}.`);
      return mentor;
    },
  },

  {
    id: 'getCopy',
    group: 'Text',
    path: '/api/v1/copy/:locale',
    summary: 'The dictionary for one language',
    description:
      'Every fixed word on the *chrome* in the language asked for: the labels on a work, the accessibility strings, the contact card, the footer, the 404 page. A page’s own title, its prose and the headings over its sections are on the page, in `/api/v1/pages`, because they belong to a page that can be deleted.',
    params: [
      {
        name: 'locale',
        in: 'path',
        required: true,
        description: 'Which language.',
        example: 'en',
        values: LOCALES,
      },
    ],
    returns: ref('Dictionary'),
    read: ({ bundle }, { params }) => {
      const locale = params.locale ?? '';
      const dictionary = bundle.dictionaries[locale];
      if (dictionary === undefined) {
        throw ApiException.notFound(`No dictionary for ${locale}. The site is ${LOCALES.join(' and ')}.`);
      }
      return dictionary;
    },
  },

  {
    id: 'listPhotographs',
    group: 'Photographs',
    path: '/api/v1/photographs',
    summary: 'Every published photograph',
    description:
      'One flat list of everything the published content cites — the works’ covers and pages, the mentors’ portraits, the galleries on the pages — each with an absolute URL, its intrinsic dimensions, its dominant hue and its alt text. A private work’s photographs are absent, because a published revision does not name them. The dimensions are measured from the file at upload rather than taken from the client, so they can be trusted as an aspect box.',
    params: [
      {
        name: 'prefix',
        in: 'query',
        required: false,
        description: 'Keep only keys that start with this. A key is the folder it was filed under when it was uploaded — "works/", "mentors/", "pages/" — and never changes afterwards, so an older photograph may sit under a folder no longer offered.',
        example: 'works/',
      },
    ],
    returns: list(ref('Photograph'), 'The photographs, grouped by what cites them.'),
    read: ({ bundle }, { query }) => {
      const prefix = query.get('prefix') ?? '';
      const photographs = photographsOf(bundle);
      return prefix === ''
        ? photographs
        : photographs.filter((photograph) => photograph.key.startsWith(prefix));
    },
  },

  {
    id: 'getBundle',
    group: 'Everything',
    path: '/api/v1/bundle',
    summary: 'The whole revision',
    description:
      'Site, pages, works, programmes, mentors, both dictionaries and every photograph’s dimensions, in one answer — around 40 KB. This is the same projection the site’s own build reads from /api/content/published; that endpoint keeps its unwrapped `{ revision, bundle }` shape because a build script in another repository parses it, and this one wears the envelope every other connector wears.',
    returns: ref('Bundle'),
    read: ({ bundle }) => bundle,
  },
];

interface Photograph {
  key: string;
  url: string;
  width: number;
  height: number;
  tint: number | null;
  alt: ImageRef['alt'];
  decorative: boolean;
  usedBy: string;
}

/**
 * The photographs, from the two halves that each know part of the answer.
 *
 * The content knows what an image is *of* and what cites it; the media map
 * knows how big it is and what colour it is. Only keys in that map are returned,
 * and that is the privacy guarantee doing its work rather than a filter of our
 * own — bundle.ts measures a photograph into it only when public content cites
 * it, so a private work's pictures cannot appear here even by accident.
 */
function photographsOf(bundle: ReadableBundle): Photograph[] {
  const base = bundle.mediaBase.replace(/\/$/, '');
  const photographs: Photograph[] = [];
  const seen = new Set<string>();

  function add(image: ImageRef, usedBy: string): void {
    const measured = bundle.media[image.src];
    if (image.src === '' || measured === undefined || seen.has(image.src)) return;
    seen.add(image.src);

    photographs.push({
      key: image.src,
      url: `${base}/${image.src}`,
      width: measured.width,
      height: measured.height,
      tint: measured.tint,
      alt: image.alt,
      decorative: image.alt === '',
      usedBy,
    });
  }

  for (const work of bundle.works) {
    add(work.cover, `work:${work.slug}`);
    for (const image of work.media) add(image, `work:${work.slug}`);
  }
  for (const mentor of bundle.mentors) add(mentor.portrait, `mentor:${mentor.slug}`);
  for (const page of bundle.pages) {
    for (const section of page.sections) {
      if (section.kind !== 'gallery') continue;
      for (const image of section.images) add(image, `page:${page.slug === '' ? '/' : page.slug}`);
    }
  }

  return photographs;
}

/** Path parameters, in the notation OpenAPI wants: `/works/:slug` → `/works/{slug}`. */
export function documentedPath(path: string): string {
  return path.replace(/:([A-Za-z0-9_]+)/g, '{$1}');
}
