/**
 * The one-shot move from files to database.
 *
 * Reads CAFA-Template's six content JSON files and everything under
 * media-source/, and writes two artefacts:
 *
 *   import/seed.sql    every INSERT, in dependency order
 *   import/upload.sh   one `wrangler r2 object put` per photograph
 *
 * It emits rather than executes, because a migration you can read before you
 * run it is a migration you can trust. Both are safe to regenerate: seed.sql
 * clears the tables it fills, in reverse dependency order, before filling them.
 *
 *   node scripts/import.mjs [path-to-CAFA-Template]
 *
 * Image dimensions come from the file headers rather than from sharp. It is
 * forty lines against a native dependency this repository would otherwise not
 * have, for a script that runs approximately once.
 *
 * The JSON predates pages, so the four the site had are composed here out of
 * the dictionaries that used to hold their words — the same mapping migration
 * 0005 performs on a database that was already seeded, done here because a
 * fresh setup applies the migrations to an empty database, where 0005 has
 * nothing to read and correctly does nothing.
 */
import { mkdir, readdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

const TEMPLATE = path.resolve(process.argv[2] ?? '../CAFA-Template');
const CONTENT = path.join(TEMPLATE, 'src', 'content');
const MEDIA = path.join(TEMPLATE, 'media-source');
const OUT = path.resolve(import.meta.dirname, '..', 'import');

const BUCKET = 'cafa-media';

/* ------------------------------------------------------------------ SQL --- */

/** SQLite string literal. Doubling the quote is the whole of the escaping. */
function q(value) {
  return `'${String(value).replaceAll("'", "''")}'`;
}

function n(value) {
  if (!Number.isFinite(value)) throw new Error(`Not a number: ${value}`);
  return String(value);
}

/**
 * An ImageRef becomes four columns: the key, both alt strings, and whether the
 * blank alt is a decision or an omission. The schema's CHECK refuses the
 * omission, so a half-filled record fails here rather than on the site.
 */
function imageColumns(image, where) {
  if (typeof image?.src !== 'string' || image.src === '') {
    throw new Error(`${where}: no image src`);
  }
  const decorative = image.alt === '';
  if (!decorative && (!image.alt?.zh?.trim() || !image.alt?.en?.trim())) {
    throw new Error(`${where}: alt text is required in both languages, or mark it decorative`);
  }
  return {
    key: image.src,
    altZh: decorative ? '' : image.alt.zh,
    altEn: decorative ? '' : image.alt.en,
    decorative: decorative ? 1 : 0,
  };
}

/* --------------------------------------------------------- Dimensions --- */

function pngSize(buffer) {
  // IHDR is always the first chunk: width and height are two big-endian
  // 32-bit integers at a fixed offset past the 8-byte signature.
  if (buffer.readUInt32BE(0) !== 0x89504e47) return null;
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

function jpegSize(buffer) {
  if (buffer.readUInt16BE(0) !== 0xffd8) return null;
  let at = 2;
  while (at < buffer.length - 9) {
    if (buffer[at] !== 0xff) {
      at += 1;
      continue;
    }
    const marker = buffer[at + 1];
    // SOF0–SOF15 carry the frame header. C4 (Huffman tables), C8 (JPEG
    // extensions) and CC (arithmetic coding) share the range and do not.
    const isFrame = marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker);
    if (isFrame) {
      return { height: buffer.readUInt16BE(at + 5), width: buffer.readUInt16BE(at + 7) };
    }
    at += 2 + buffer.readUInt16BE(at + 2);
  }
  return null;
}

async function measure(file) {
  const buffer = await readFile(file);
  const size = path.extname(file).toLowerCase() === '.png' ? pngSize(buffer) : jpegSize(buffer);
  if (size === null) throw new Error(`Cannot read the dimensions of ${file}`);
  return { ...size, bytes: buffer.length };
}

/* ------------------------------------------------------------- Sources --- */

async function readJson(name) {
  return JSON.parse(await readFile(path.join(CONTENT, name), 'utf8'));
}

/** Every image under media-source, as POSIX keys relative to it. */
async function collectMedia(dir = MEDIA, prefix = '') {
  const entries = await readdir(dir, { withFileTypes: true });
  const found = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const key = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) {
      found.push(...(await collectMedia(path.join(dir, entry.name), key)));
    } else if (['.jpg', '.jpeg', '.png'].includes(path.extname(entry.name).toLowerCase())) {
      found.push(key);
    }
  }
  return found;
}

/**
 * A dictionary flattened to dotted paths. Arrays become numeric segments, which
 * is what lets `about.body` survive the round trip as an array rather than as
 * an object with numeric keys.
 */
function flatten(value, trail, into) {
  if (typeof value === 'string') {
    into.set(trail.join('.'), value);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, at) => flatten(item, [...trail, String(at)], into));
    return;
  }
  if (typeof value === 'object' && value !== null) {
    for (const [key, nested] of Object.entries(value)) flatten(nested, [...trail, key], into);
  }
}

/* --------------------------------------------------------------- Main --- */

const [site, works, programs, mentors, zh, en] = await Promise.all([
  readJson('site.json'),
  readJson('works.json'),
  readJson('programs.json'),
  readJson('mentors.json'),
  readJson('dictionaries/zh.json'),
  readJson('dictionaries/en.json'),
]);

const mediaKeys = await collectMedia();
const sizes = new Map();
for (const key of mediaKeys) {
  sizes.set(key, await measure(path.join(MEDIA, key)));
}

/** Referenced but absent is a broken build later; say so now. */
function requireMedia(key, where) {
  if (!sizes.has(key)) throw new Error(`${where}: media-source/${key} does not exist`);
  return key;
}

/*
 * The dictionaries, flattened to the dotted paths the copy table stores and the
 * pages read their words from, plus the two pieces of chrome that lived in
 * site.json rather than in a dictionary.
 *
 * `contact.nav` is the word that opens the contact card. It came from the nav
 * list, because contact used to be a nav item like any other; it is the one
 * item that is not a page — it pins a card over whichever page you are on — so
 * it stays copy while the rest of the nav became a column on `pages`.
 */
const zhFlat = new Map();
const enFlat = new Map();
flatten(zh, [], zhFlat);
flatten(en, [], enFlat);

const navLabels = new Map(
  site.nav.flatMap((entry) => (entry.route === undefined ? [] : [[entry.route, entry.label]])),
);

const contactNav = site.nav.find((entry) => entry.opens === 'contact');
if (contactNav === undefined) throw new Error('site.json has no contact nav item');
zhFlat.set('contact.nav', contactNav.label.zh);
enFlat.set('contact.nav', contactNav.label.en);
zhFlat.set('localeName', site.localeNames.zh);
enFlat.set('localeName', site.localeNames.en);

/** The about page's paragraphs, whose count decides how many rows it emits. */
const about = zh.about;

const lines = [];
const say = (line = '') => lines.push(line);

say('-- Generated by scripts/import.mjs. Re-runnable: it clears before it fills.');
say('PRAGMA defer_foreign_keys = TRUE;');
say();
say('DELETE FROM work_media;');
say('DELETE FROM work_credit;');
say('DELETE FROM work_discipline;');
say('DELETE FROM section_media;');
say('DELETE FROM section_paragraph;');
say('DELETE FROM page_section;');
say('DELETE FROM pages;');
say('DELETE FROM works;');
say('DELETE FROM programs;');
say('DELETE FROM mentors;');
say('DELETE FROM site;');
say('DELETE FROM media;');
say();

say('-- media -------------------------------------------------------------');
for (const key of mediaKeys) {
  const { width, height, bytes } = sizes.get(key);
  say(
    `INSERT INTO media (key, width, height, bytes) VALUES (${q(key)}, ${n(width)}, ${n(height)}, ${n(bytes)});`,
  );
}
say();

say('-- site --------------------------------------------------------------');
say(
  // No url: the site's origin comes from the PRODUCTION_URL var now, not from
  // a column. Migration 0002 has the reasoning.
  `INSERT INTO site (id, name_zh, name_en, contact_email, contact_wechat, address_zh, address_en, hours_zh, hours_en)\n` +
    `VALUES (1, ${q(site.name.zh)}, ${q(site.name.en)}, ${q(site.contact.email)}, ` +
    `${q(site.contact.wechat)}, ${q(site.contact.address.zh)}, ${q(site.contact.address.en)}, ` +
    `${q(site.contact.hours.zh)}, ${q(site.contact.hours.en)});`,
);
say();

say('-- pages --------------------------------------------------------------');
/*
 * The four pages the site had when they were route files, as the rows that
 * replaced them. This is the same mapping migration 0005 performs against a
 * database that was already seeded; it is here as well because a *fresh* setup
 * runs the migrations against an empty database, where 0005 has nothing to read
 * and correctly does nothing.
 *
 * Each entry names where its words come from — the dictionaries, which is where
 * they lived when a page's title was UI copy — and the sections it is made of.
 * `text` is a dotted dictionary path; a section carries whichever of `text`,
 * `paragraphs` and `images` its kind has.
 */
const pages = [
  {
    slug: '',
    title: 'meta.title',
    description: 'meta.description',
    nav: null,
    sections: [
      { kind: 'statement', text: 'home.statement' },
      { kind: 'gallery', images: site.studio },
    ],
  },
  {
    slug: 'works',
    title: 'works.title',
    description: 'works.description',
    nav: 'works',
    sections: [{ kind: 'heading' }, { kind: 'works-index' }],
  },
  {
    slug: 'programs',
    title: 'programs.title',
    description: 'programs.description',
    nav: 'programs',
    sections: [
      { kind: 'heading' },
      { kind: 'prose', paragraphs: ['programs.intro'] },
      { kind: 'programs' },
    ],
  },
  {
    slug: 'about',
    title: 'about.title',
    description: 'about.description',
    nav: 'about',
    sections: [
      { kind: 'heading' },
      { kind: 'prose', paragraphs: about.body.map((_, at) => `about.body.${at}`) },
      { kind: 'mentors', text: 'about.mentorsTitle' },
      { kind: 'works-grid', text: 'about.worksTitle' },
    ],
  },
];

/**
 * A dotted dictionary path, in both languages, or undefined where the source
 * does not have it.
 *
 * Undefined is a real answer rather than a failure, because the JSON this reads
 * is a snapshot: a section whose words are not in it is a section that page did
 * not have when the snapshot was taken. The importer composes what the source
 * actually describes and says at the end what it left out; a page that ends up
 * with no heading at all still fails, at the site's build gate, loudly.
 */
function words(path) {
  const zhText = zhFlat.get(path);
  const enText = enFlat.get(path);
  if (zhText === undefined || enText === undefined) return undefined;
  return { zh: zhText, en: enText };
}

/** A page's own words are not optional: a page with no title is a mistake. */
function requireWords(path) {
  const found = words(path);
  if (found === undefined) throw new Error(`the dictionaries are missing "${path}"`);
  return found;
}

const skipped = [];

pages.forEach((page, at) => {
  const title = requireWords(page.title);
  const description = requireWords(page.description);
  const nav = page.nav === null ? null : navLabels.get(page.nav);
  if (page.nav !== null && nav === undefined) {
    throw new Error(`site.json has no nav item called "${page.nav}"`);
  }

  say(
    `INSERT INTO pages (slug, position, title_zh, title_en, description_zh, description_en,\n` +
      `                   in_nav, nav_zh, nav_en)\n` +
      `VALUES (${q(page.slug)}, ${n(at)}, ${q(title.zh)}, ${q(title.en)}, ` +
      `${q(description.zh)}, ${q(description.en)},\n` +
      `        ${n(nav === null ? 0 : 1)}, ${q(nav?.zh ?? '')}, ${q(nav?.en ?? '')});`,
  );

  // Position is the section's identity, so it counts the sections actually
  // emitted rather than the ones offered: a skipped one must not leave a gap.
  let position = 0;
  for (const section of page.sections) {
    const text = section.text === undefined ? { zh: '', en: '' } : words(section.text);
    if (text === undefined) {
      skipped.push(`${page.slug || '/'} — ${section.kind} (no "${section.text}")`);
      continue;
    }

    say(
      `INSERT INTO page_section (page_slug, position, kind, text_zh, text_en) ` +
        `VALUES (${q(page.slug)}, ${n(position)}, ${q(section.kind)}, ${q(text.zh)}, ${q(text.en)});`,
    );

    for (const [ordinal, paragraph] of (section.paragraphs ?? []).entries()) {
      const line = requireWords(paragraph);
      say(
        `INSERT INTO section_paragraph (page_slug, section_position, position, zh, en) ` +
          `VALUES (${q(page.slug)}, ${n(position)}, ${n(ordinal)}, ${q(line.zh)}, ${q(line.en)});`,
      );
    }

    for (const [ordinal, image] of (section.images ?? []).entries()) {
      const where = `pages.${page.slug || 'home'}.images[${ordinal}]`;
      const c = imageColumns(image, where);
      requireMedia(c.key, where);
      say(
        `INSERT INTO section_media (page_slug, section_position, position, media_key, ` +
          `alt_zh, alt_en, decorative) ` +
          `VALUES (${q(page.slug)}, ${n(position)}, ${n(ordinal)}, ${q(c.key)}, ` +
          `${q(c.altZh)}, ${q(c.altEn)}, ${n(c.decorative)});`,
      );
    }

    position += 1;
  }
  say();
});

say('-- works --------------------------------------------------------------');
works.forEach((work, at) => {
  const cover = imageColumns(work.cover, `works.${work.slug}.cover`);
  requireMedia(cover.key, `works.${work.slug}.cover`);
  say(
    `INSERT INTO works (slug, position, index_no, title_zh, title_en, status, year, summary_zh, summary_en,\n` +
      `                   cover_key, cover_alt_zh, cover_alt_en, cover_decorative)\n` +
      `VALUES (${q(work.slug)}, ${n(at)}, ${n(work.index)}, ${q(work.title.zh)}, ${q(work.title.en)}, ` +
      `${q(work.status)}, ${n(work.year)}, ${q(work.summary.zh)}, ${q(work.summary.en)},\n` +
      `        ${q(cover.key)}, ${q(cover.altZh)}, ${q(cover.altEn)}, ${n(cover.decorative)});`,
  );

  work.discipline.forEach((entry, position) => {
    say(
      `INSERT INTO work_discipline (work_slug, position, zh, en) ` +
        `VALUES (${q(work.slug)}, ${n(position)}, ${q(entry.zh)}, ${q(entry.en)});`,
    );
  });

  work.credits.forEach((credit, position) => {
    say(
      `INSERT INTO work_credit (work_slug, position, role_zh, role_en, name_zh, name_en) ` +
        `VALUES (${q(work.slug)}, ${n(position)}, ${q(credit.role.zh)}, ${q(credit.role.en)}, ` +
        `${q(credit.name.zh)}, ${q(credit.name.en)});`,
    );
  });

  work.media.forEach((image, position) => {
    const c = imageColumns(image, `works.${work.slug}.media[${position}]`);
    requireMedia(c.key, `works.${work.slug}.media[${position}]`);
    say(
      `INSERT INTO work_media (work_slug, position, media_key, alt_zh, alt_en, decorative) ` +
        `VALUES (${q(work.slug)}, ${n(position)}, ${q(c.key)}, ${q(c.altZh)}, ${q(c.altEn)}, ${n(c.decorative)});`,
    );
  });
  say();
});

say('-- programmes ---------------------------------------------------------');
programs.forEach((program, at) => {
  say(
    `INSERT INTO programs (slug, position, name_zh, name_en, audience_zh, audience_en,\n` +
      `                      duration_zh, duration_en, summary_zh, summary_en)\n` +
      `VALUES (${q(program.slug)}, ${n(at)}, ${q(program.name.zh)}, ${q(program.name.en)}, ` +
      `${q(program.audience.zh)}, ${q(program.audience.en)},\n` +
      `        ${q(program.duration.zh)}, ${q(program.duration.en)}, ` +
      `${q(program.summary.zh)}, ${q(program.summary.en)});`,
  );
});
say();

say('-- mentors ------------------------------------------------------------');
mentors.forEach((mentor, at) => {
  const p = imageColumns(mentor.portrait, `mentors.${mentor.slug}.portrait`);
  requireMedia(p.key, `mentors.${mentor.slug}.portrait`);
  say(
    `INSERT INTO mentors (slug, position, name_zh, name_en, discipline_zh, discipline_en,\n` +
      `                     note_zh, note_en, portrait_key, portrait_alt_zh, portrait_alt_en, portrait_decorative)\n` +
      `VALUES (${q(mentor.slug)}, ${n(at)}, ${q(mentor.name.zh)}, ${q(mentor.name.en)}, ` +
      `${q(mentor.discipline.zh)}, ${q(mentor.discipline.en)},\n` +
      `        ${q(mentor.note.zh)}, ${q(mentor.note.en)}, ${q(p.key)}, ` +
      `${q(p.altZh)}, ${q(p.altEn)}, ${n(p.decorative)});`,
  );
});
say();

say('-- UI copy ------------------------------------------------------------');

/*
 * What is left in the copy table is the chrome: the words that outlive every
 * page. A page's own title, its prose and the headings over its sections are
 * fields on the page rows above, because they belong to a page that can be
 * deleted — so those dictionary paths are read by the pages and dropped here.
 *
 * `localeName` is what a language calls itself in the switch, and `contact.nav`
 * is the word that opens the contact card. Both are chrome, and neither was in
 * a dictionary: they came from site.json, so they are added rather than kept.
 */
const MOVED_TO_PAGES = [
  // Retired before pages existed: migration 0003 deleted both, because the nav
  // already carried the works link and the studio photographs left the about
  // page. The snapshot this reads still has them.
  'home.worksLink',
  'about.studioTitle',

  'home.statement',
  'works.title',
  'works.description',
  'programs.title',
  'programs.description',
  'programs.intro',
  'about.title',
  'about.description',
  'about.mentorsTitle',
  'about.worksTitle',
];

const chrome = (map) =>
  [...map.keys()].filter(
    (key) => !MOVED_TO_PAGES.includes(key) && !key.startsWith('about.body.'),
  );

/*
 * Replace rather than clear-and-fill, and this is the one table that works that
 * way. Copy *keys* are schema — one exists because the template reads it by
 * name — so they arrive by migration, beside the code that reads them. The
 * snapshot this script reads is older than some of those migrations, so
 * clearing the table first would delete keys it has no values for and leave the
 * site unbuildable. Values are what an import supplies; keys are not its to
 * remove.
 */
for (const key of chrome(zhFlat).sort()) {
  const english = enFlat.get(key);
  if (english === undefined) throw new Error(`dictionaries/en.json is missing "${key}"`);
  say(
    `INSERT OR REPLACE INTO copy (key, zh, en) ` +
      `VALUES (${q(key)}, ${q(zhFlat.get(key))}, ${q(english)});`,
  );
}
for (const key of enFlat.keys()) {
  if (!zhFlat.has(key)) throw new Error(`dictionaries/zh.json is missing "${key}"`);
}

await mkdir(OUT, { recursive: true });
await writeFile(path.join(OUT, 'seed.sql'), `${lines.join('\n')}\n`, 'utf8');

const upload = [
  '#!/bin/sh',
  '# Generated by scripts/import.mjs. Uploads every original into R2.',
  '# Re-runnable: an object put over an existing key replaces it.',
  'set -e',
  '',
  ...mediaKeys.map(
    (key) =>
      `npx wrangler r2 object put ${BUCKET}/${key} --file ${JSON.stringify(path.join(MEDIA, key))} --remote`,
  ),
  '',
];
await writeFile(path.join(OUT, 'upload.sh'), upload.join('\n'), { mode: 0o755 });

const totalBytes = [...sizes.values()].reduce((sum, entry) => sum + entry.bytes, 0);
console.info(
  [
    `import: ${works.length} works, ${programs.length} programmes, ${mentors.length} mentors`,
    `        ${pages.length} pages, ${chrome(zhFlat).length} copy keys, ` +
      `${mediaKeys.length} images (${(totalBytes / 1e6).toFixed(1)} MB)`,
    '',
    ...(skipped.length === 0 ? [] : ['', 'Sections the source had no words for, left out:', ...skipped.map((line) => `  ${line}`)]),
    '',
    'Then, once the database and bucket exist:',
    '  npx wrangler d1 execute cafa-content --remote --file import/seed.sql',
    '  sh import/upload.sh',
  ].join('\n'),
);
