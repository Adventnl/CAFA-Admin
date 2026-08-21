-- Pages become content.
--
-- Until now the site had four pages and the database had none. CAFA-Template
-- carried a route file for each — home, works, programmes, about — and each one
-- spelled out which blocks it had and in what order, so the *set* of pages and
-- the composition of every one of them lived in a git repository. The admin
-- edited the words inside those blocks and nothing else: a studio that wanted a
-- fifth page, or wanted the mentors above the prose on About, needed a
-- developer. This is what that costs to fix, and it is one migration.
--
-- A page is a slug, the words that name it, and an ordered list of sections.
-- A section is a kind and, for the kinds that have any, its own data — a line
-- of copy, some paragraphs, some photographs. Every kind is one component in
-- the template and every such component is one kind, so what the studio composes
-- here is exactly what the site can draw.
--
-- Three things are deliberately *not* CHECK constraints:
--
--   * `kind` has no enum. The kinds are the template's components and the list
--     will grow; SQLite cannot alter a CHECK without rebuilding the table, so
--     the constraint would make every new component a table rebuild. It is
--     checked in src/content/validate.ts, which refuses the save, and again at
--     the template's build gate, which refuses the build.
--   * "exactly one page with an empty slug" and "exactly one heading-bearing
--     section per page" are statements about a *set* of rows. Both are checked
--     in the same two places, for the same reason.
--
-- What each kind means by its columns:
--
--   heading       nothing. It sets the page's own title as the h1.
--   statement     text_*  — one line, holding the front page's first screen.
--   prose         section_paragraph rows.
--   gallery       section_media rows.
--   works-index   nothing. The whole registry, as the ium list.
--   works-grid    text_*  — the heading over the grid of covers.
--   programs      nothing. Every programme.
--   mentors       text_*  — the heading on the filmstrip.
--
-- Apply this *before* deploying the Worker that goes with it: between the two,
-- a save would write pages the old Worker has no tables for. It is a one-person
-- admin and the window is a deploy, but the order is free.

CREATE TABLE pages (
  slug            TEXT PRIMARY KEY,     -- one segment under the locale; '' is the front page
  position        INTEGER NOT NULL,     -- order in the site, and so order in the nav
  title_zh        TEXT NOT NULL,
  title_en        TEXT NOT NULL,
  description_zh  TEXT NOT NULL,        -- the meta description
  description_en  TEXT NOT NULL,
  in_nav          INTEGER NOT NULL DEFAULT 0 CHECK (in_nav IN (0, 1)),
  nav_zh          TEXT NOT NULL DEFAULT '',
  nav_en          TEXT NOT NULL DEFAULT '',
  -- A page in the bar has a word in both languages. Out of the bar, both are
  -- blank — the same shape the image tables use for a decorative alt: absence
  -- is a decision, and a half-filled one is refused rather than published.
  CHECK (in_nav = 0 OR (nav_zh <> '' AND nav_en <> ''))
);

CREATE TABLE page_section (
  page_slug TEXT    NOT NULL REFERENCES pages(slug) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  kind      TEXT    NOT NULL,
  text_zh   TEXT    NOT NULL DEFAULT '',
  text_en   TEXT    NOT NULL DEFAULT '',
  PRIMARY KEY (page_slug, position)
);

CREATE TABLE section_paragraph (
  page_slug        TEXT    NOT NULL,
  section_position INTEGER NOT NULL,
  position         INTEGER NOT NULL,
  zh               TEXT    NOT NULL,
  en               TEXT    NOT NULL,
  PRIMARY KEY (page_slug, section_position, position),
  FOREIGN KEY (page_slug, section_position)
    REFERENCES page_section(page_slug, position) ON DELETE CASCADE
);

CREATE TABLE section_media (
  page_slug        TEXT    NOT NULL,
  section_position INTEGER NOT NULL,
  position         INTEGER NOT NULL,
  media_key        TEXT    NOT NULL REFERENCES media(key),
  alt_zh           TEXT    NOT NULL DEFAULT '',
  alt_en           TEXT    NOT NULL DEFAULT '',
  decorative       INTEGER NOT NULL DEFAULT 0 CHECK (decorative IN (0, 1)),
  PRIMARY KEY (page_slug, section_position, position),
  FOREIGN KEY (page_slug, section_position)
    REFERENCES page_section(page_slug, position) ON DELETE CASCADE,
  CHECK (decorative = 1 OR (alt_zh <> '' AND alt_en <> ''))
);

CREATE INDEX pages_position ON pages (position);

-- The four pages the site already has, built out of the copy that described
-- them. Nothing is invented here: every string below is lifted from the row
-- that already held it, so applying this changes no word on the live site — it
-- changes only who owns the words, and whether the page can be deleted.
--
-- Every insert is conditional on the row it reads existing. That is not
-- defensiveness for its own sake: a database that has had the migrations run
-- but has never been seeded has no copy at all, and an unconditional insert
-- would fail a NOT NULL halfway through and leave the schema half-applied. The
-- conditional form does the whole job on a seeded database and nothing at all
-- on an empty one, which is the right answer to both.

INSERT INTO pages (slug, position, title_zh, title_en, description_zh, description_en,
                   in_nav, nav_zh, nav_en)
SELECT '', 0, t.zh, t.en,
       (SELECT zh FROM copy WHERE key = 'meta.description'),
       (SELECT en FROM copy WHERE key = 'meta.description'),
       0, '', ''
FROM copy t WHERE t.key = 'meta.title';

INSERT INTO pages (slug, position, title_zh, title_en, description_zh, description_en,
                   in_nav, nav_zh, nav_en)
SELECT 'works', 1, t.zh, t.en,
       (SELECT zh FROM copy WHERE key = 'works.description'),
       (SELECT en FROM copy WHERE key = 'works.description'),
       1,
       (SELECT zh FROM copy WHERE key = 'nav.works'),
       (SELECT en FROM copy WHERE key = 'nav.works')
FROM copy t WHERE t.key = 'works.title';

INSERT INTO pages (slug, position, title_zh, title_en, description_zh, description_en,
                   in_nav, nav_zh, nav_en)
SELECT 'programs', 2, t.zh, t.en,
       (SELECT zh FROM copy WHERE key = 'programs.description'),
       (SELECT en FROM copy WHERE key = 'programs.description'),
       1,
       (SELECT zh FROM copy WHERE key = 'nav.programs'),
       (SELECT en FROM copy WHERE key = 'nav.programs')
FROM copy t WHERE t.key = 'programs.title';

INSERT INTO pages (slug, position, title_zh, title_en, description_zh, description_en,
                   in_nav, nav_zh, nav_en)
SELECT 'about', 3, t.zh, t.en,
       (SELECT zh FROM copy WHERE key = 'about.description'),
       (SELECT en FROM copy WHERE key = 'about.description'),
       1,
       (SELECT zh FROM copy WHERE key = 'nav.about'),
       (SELECT en FROM copy WHERE key = 'nav.about')
FROM copy t WHERE t.key = 'about.title';

-- The front page: the statement, then the studio photographs below the fold.
INSERT INTO page_section (page_slug, position, kind, text_zh, text_en)
SELECT '', 0, 'statement', c.zh, c.en FROM copy c WHERE c.key = 'home.statement';

INSERT INTO page_section (page_slug, position, kind)
SELECT '', 1, 'gallery' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = '');

INSERT INTO section_media (page_slug, section_position, position, media_key,
                           alt_zh, alt_en, decorative)
SELECT '', 1, position, media_key, alt_zh, alt_en, decorative
FROM site_studio
WHERE EXISTS (SELECT 1 FROM page_section WHERE page_slug = '' AND position = 1);

-- Works: its title as the h1, then the index.
INSERT INTO page_section (page_slug, position, kind)
SELECT 'works', 0, 'heading' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = 'works');
INSERT INTO page_section (page_slug, position, kind)
SELECT 'works', 1, 'works-index' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = 'works');

-- Programmes: the h1, the lead paragraph, the list.
INSERT INTO page_section (page_slug, position, kind)
SELECT 'programs', 0, 'heading' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = 'programs');
INSERT INTO page_section (page_slug, position, kind)
SELECT 'programs', 1, 'prose' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = 'programs');
INSERT INTO section_paragraph (page_slug, section_position, position, zh, en)
SELECT 'programs', 1, 0, c.zh, c.en
FROM copy c
WHERE c.key = 'programs.intro'
  AND EXISTS (SELECT 1 FROM page_section WHERE page_slug = 'programs' AND position = 1);
INSERT INTO page_section (page_slug, position, kind)
SELECT 'programs', 2, 'programs' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = 'programs');

-- About: the h1, the prose, the mentors, the projects.
INSERT INTO page_section (page_slug, position, kind)
SELECT 'about', 0, 'heading' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = 'about');
INSERT INTO page_section (page_slug, position, kind)
SELECT 'about', 1, 'prose' WHERE EXISTS (SELECT 1 FROM pages WHERE slug = 'about');

-- `about.body` was stored as `about.body.0`, `about.body.1`, … — a flattened
-- array, which is exactly the paragraph list this table wants. The ordinal is
-- read back off the key rather than off rowid, so the paragraphs keep the order
-- they were written in.
INSERT INTO section_paragraph (page_slug, section_position, position, zh, en)
SELECT 'about', 1, CAST(substr(key, length('about.body.') + 1) AS INTEGER), zh, en
FROM copy
WHERE key LIKE 'about.body.%'
  AND EXISTS (SELECT 1 FROM page_section WHERE page_slug = 'about' AND position = 1);

INSERT INTO page_section (page_slug, position, kind, text_zh, text_en)
SELECT 'about', 2, 'mentors', c.zh, c.en
FROM copy c
WHERE c.key = 'about.mentorsTitle' AND EXISTS (SELECT 1 FROM pages WHERE slug = 'about');

INSERT INTO page_section (page_slug, position, kind, text_zh, text_en)
SELECT 'about', 3, 'works-grid', c.zh, c.en
FROM copy c
WHERE c.key = 'about.worksTitle' AND EXISTS (SELECT 1 FROM pages WHERE slug = 'about');

-- The copy those pages were made of has a home now. What is left in the table
-- is the chrome: the words that outlive every page.
--
-- `nav.contact` is renamed rather than deleted. The contact card is not a page
-- — it is pinned over whichever page you are on — so the word that opens it is
-- still copy, and it now sits with the rest of the card's copy instead of in a
-- `nav` group with nothing else in it.
UPDATE copy SET key = 'contact.nav' WHERE key = 'nav.contact';

DELETE FROM copy WHERE key IN (
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
  'nav.works',
  'nav.programs',
  'nav.about'
);
DELETE FROM copy WHERE key LIKE 'about.body.%';

-- And the studio photographs, which are a gallery section's rows now. One
-- source of truth: leaving the table would leave two lists of the same
-- photographs with nothing keeping them equal.
DROP TABLE site_studio;
