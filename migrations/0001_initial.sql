-- The content of the c.a.f.a atelier site.
--
-- Localised text is paired columns rather than JSON or a translations table.
-- Two locales, fixed, both always required: "both languages, always" is a rule
-- the site is built on, and paired NOT NULL columns put it in the schema
-- instead of only in a validator. A third locale is a migration, which is
-- correct — locales are wired to lib/routes.ts and adding one is a code change.
--
-- Every image usage carries its own alt text and the same CHECK, so CLAUDE.md
-- §10 — alt is required, decorative is a deliberate choice — is enforced by the
-- database rather than discovered at build time.

-- One row. Everything hangs off it. This is the seam that makes multi-tenant a
-- migration rather than a rewrite, and it costs one table to leave open.
CREATE TABLE site (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  name_zh        TEXT NOT NULL,
  name_en        TEXT NOT NULL,
  url            TEXT NOT NULL,
  contact_email  TEXT NOT NULL,
  contact_wechat TEXT NOT NULL,
  address_zh     TEXT NOT NULL,
  address_en     TEXT NOT NULL,
  hours_zh       TEXT NOT NULL,
  hours_en       TEXT NOT NULL
);

-- The file registry: one row per original in R2.
--
-- width and height are recorded when the photograph is uploaded, which is
-- precisely what lets the frontend reserve the aspect box without the build
-- ever touching image bytes. Nothing here is derived at build time any more.
CREATE TABLE media (
  key        TEXT PRIMARY KEY,          -- R2 object key, "works/kiln-and-corridor/01.jpg"
  width      INTEGER NOT NULL CHECK (width > 0),
  height     INTEGER NOT NULL CHECK (height > 0),
  bytes      INTEGER NOT NULL CHECK (bytes > 0),
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE works (
  slug             TEXT PRIMARY KEY,
  position         INTEGER NOT NULL,    -- editorial order; was the array order in works.json
  index_no         INTEGER NOT NULL,    -- the ium running number shown in the list
  title_zh         TEXT NOT NULL,
  title_en         TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('completed', 'in-progress', 'private')),
  year             INTEGER NOT NULL,
  summary_zh       TEXT NOT NULL,
  summary_en       TEXT NOT NULL,
  cover_key        TEXT NOT NULL REFERENCES media(key),
  cover_alt_zh     TEXT NOT NULL DEFAULT '',
  cover_alt_en     TEXT NOT NULL DEFAULT '',
  cover_decorative INTEGER NOT NULL DEFAULT 0 CHECK (cover_decorative IN (0, 1)),
  CHECK (cover_decorative = 1 OR (cover_alt_zh <> '' AND cover_alt_en <> ''))
);

CREATE TABLE work_discipline (
  work_slug TEXT    NOT NULL REFERENCES works(slug) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  zh        TEXT    NOT NULL,
  en        TEXT    NOT NULL,
  PRIMARY KEY (work_slug, position)
);

CREATE TABLE work_credit (
  work_slug TEXT    NOT NULL REFERENCES works(slug) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  role_zh   TEXT    NOT NULL,
  role_en   TEXT    NOT NULL,
  name_zh   TEXT    NOT NULL,
  name_en   TEXT    NOT NULL,
  PRIMARY KEY (work_slug, position)
);

CREATE TABLE work_media (
  work_slug  TEXT    NOT NULL REFERENCES works(slug) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  media_key  TEXT    NOT NULL REFERENCES media(key),
  alt_zh     TEXT    NOT NULL DEFAULT '',
  alt_en     TEXT    NOT NULL DEFAULT '',
  decorative INTEGER NOT NULL DEFAULT 0 CHECK (decorative IN (0, 1)),
  PRIMARY KEY (work_slug, position),
  CHECK (decorative = 1 OR (alt_zh <> '' AND alt_en <> ''))
);

CREATE TABLE programs (
  slug        TEXT PRIMARY KEY,
  position    INTEGER NOT NULL,
  name_zh     TEXT NOT NULL,
  name_en     TEXT NOT NULL,
  audience_zh TEXT NOT NULL,
  audience_en TEXT NOT NULL,
  duration_zh TEXT NOT NULL,
  duration_en TEXT NOT NULL,
  summary_zh  TEXT NOT NULL,
  summary_en  TEXT NOT NULL
);

CREATE TABLE mentors (
  slug                TEXT PRIMARY KEY,
  position            INTEGER NOT NULL,
  name_zh             TEXT NOT NULL,
  name_en             TEXT NOT NULL,
  discipline_zh       TEXT NOT NULL,
  discipline_en       TEXT NOT NULL,
  note_zh             TEXT NOT NULL,
  note_en             TEXT NOT NULL,
  portrait_key        TEXT NOT NULL REFERENCES media(key),
  portrait_alt_zh     TEXT NOT NULL DEFAULT '',
  portrait_alt_en     TEXT NOT NULL DEFAULT '',
  portrait_decorative INTEGER NOT NULL DEFAULT 0 CHECK (portrait_decorative IN (0, 1)),
  CHECK (portrait_decorative = 1 OR (portrait_alt_zh <> '' AND portrait_alt_en <> ''))
);

CREATE TABLE site_studio (
  position   INTEGER PRIMARY KEY,
  media_key  TEXT    NOT NULL REFERENCES media(key),
  alt_zh     TEXT    NOT NULL DEFAULT '',
  alt_en     TEXT    NOT NULL DEFAULT '',
  decorative INTEGER NOT NULL DEFAULT 0 CHECK (decorative IN (0, 1)),
  CHECK (decorative = 1 OR (alt_zh <> '' AND alt_en <> ''))
);

-- The UI copy, flat.
--
-- The dictionaries are ~60 nested strings each. Modelling nested UI copy
-- relationally is a trap; a dotted path is the honest shape. Consecutive
-- integer segments ("about.body.0", "about.body.1") rebuild as an array.
--
-- Keys are schema, not data: a key exists because the template's Dictionary
-- type has a field for it. The admin edits values and never adds or removes
-- keys — new keys arrive by migration, beside the code that reads them.
CREATE TABLE copy (
  key TEXT PRIMARY KEY,
  zh  TEXT NOT NULL,
  en  TEXT NOT NULL
);

-- What the public site is built from.
--
-- Saving writes the tables above; publishing snapshots them here. At ~39 KB a
-- whole-content snapshot per publish is free, and it buys back what git was
-- providing: history, rollback, and a build that reads exactly one row and so
-- can never catch a half-finished save.
--
-- Rolling back inserts a new revision holding an old one's content. History is
-- never mutated.
CREATE TABLE revision (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  content      TEXT NOT NULL,
  message      TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_by TEXT NOT NULL
);

CREATE INDEX works_position ON works (position);
CREATE INDEX programs_position ON programs (position);
CREATE INDEX mentors_position ON mentors (position);
CREATE INDEX revision_published_at ON revision (published_at DESC);
