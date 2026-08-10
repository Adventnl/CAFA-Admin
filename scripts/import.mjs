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

const lines = [];
const say = (line = '') => lines.push(line);

say('-- Generated by scripts/import.mjs. Re-runnable: it clears before it fills.');
say('PRAGMA defer_foreign_keys = TRUE;');
say();
say('DELETE FROM work_media;');
say('DELETE FROM work_credit;');
say('DELETE FROM work_discipline;');
say('DELETE FROM site_studio;');
say('DELETE FROM works;');
say('DELETE FROM programs;');
say('DELETE FROM mentors;');
say('DELETE FROM copy;');
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
  `INSERT INTO site (id, name_zh, name_en, url, contact_email, contact_wechat, address_zh, address_en, hours_zh, hours_en)\n` +
    `VALUES (1, ${q(site.name.zh)}, ${q(site.name.en)}, ${q(site.url)}, ${q(site.contact.email)}, ` +
    `${q(site.contact.wechat)}, ${q(site.contact.address.zh)}, ${q(site.contact.address.en)}, ` +
    `${q(site.contact.hours.zh)}, ${q(site.contact.hours.en)});`,
);
say();

say('-- studio photographs -------------------------------------------------');
site.studio.forEach((image, at) => {
  const c = imageColumns(image, `site.studio[${at}]`);
  requireMedia(c.key, `site.studio[${at}]`);
  say(
    `INSERT INTO site_studio (position, media_key, alt_zh, alt_en, decorative)\n` +
      `VALUES (${n(at)}, ${q(c.key)}, ${q(c.altZh)}, ${q(c.altEn)}, ${n(c.decorative)});`,
  );
});
say();

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
const zhFlat = new Map();
const enFlat = new Map();
flatten(zh, [], zhFlat);
flatten(en, [], enFlat);

/*
 * The chrome copy, which site.json carried and the dictionaries did not.
 *
 * The nav's shape is code — worker/bundle.ts owns the order and what each item
 * points at — but its labels are words on a screen, so they become copy the
 * studio can edit. The key is the route or panel name, which is what bundle.ts
 * looks them up by. `localeName` is what a language calls itself in the switch.
 */
for (const entry of site.nav) {
  const key = `nav.${entry.route ?? entry.opens}`;
  zhFlat.set(key, entry.label.zh);
  enFlat.set(key, entry.label.en);
}
zhFlat.set('localeName', site.localeNames.zh);
enFlat.set('localeName', site.localeNames.en);

for (const key of [...zhFlat.keys()].sort()) {
  const english = enFlat.get(key);
  if (english === undefined) throw new Error(`dictionaries/en.json is missing "${key}"`);
  say(`INSERT INTO copy (key, zh, en) VALUES (${q(key)}, ${q(zhFlat.get(key))}, ${q(english)});`);
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
    `        ${zhFlat.size} copy keys, ${mediaKeys.length} images (${(totalBytes / 1e6).toFixed(1)} MB)`,
    '',
    'Then, once the database and bucket exist:',
    '  npx wrangler d1 execute cafa-content --remote --file import/seed.sql',
    '  sh import/upload.sh',
  ].join('\n'),
);
