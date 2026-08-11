# Migration — from git-as-database to D1

How the atelier site moves from content-in-the-repository to content-in-a-database,
without giving up the thing that makes it fast.

This spans both repositories. CAFA-Admin becomes the backend; CAFA-Template
becomes a frontend that gets its content from that backend instead of from files
checked in beside its code.

> **Status: implemented.** All five phases are in the code. What still needs
> hands on a Cloudflare account is the provisioning in §8 — creating the
> database and bucket, running the seed and the upload, setting the secrets and
> wiring the two deploy hooks. Three things ended up different from the plan as
> first written, and are described where they occur: the build-time fetch is a
> prebuild script rather than a fetch inside `lib/content.ts` (§1), the preview
> survived instead of being dropped with the draft branch (§7), and the nav's
> labels became editable copy (§4).

---

## 1. The decision that shapes everything else

"A purely frontend site that fetches from the backend" has two readings, and they
are not close to equivalent.

**Fetching at runtime**, in the browser, is the reading that sounds right and is
wrong. The site's performance budgets are not incidental to it — they are most of
what the design *is*. Runtime fetching breaks them structurally, not marginally:

- **LCP.** Today the HTML arrives from an edge cache with the content already in
  it, and the preload scanner finds the hero image URL while the HTML is still
  streaming. Fetching at runtime makes it HTML → JS → API → parse → render →
  *then* discover the image. Three serial round trips before the largest element
  starts downloading. On the budget's own terms — mobile, 4× CPU throttle, Slow 4G
  — 1.8 s is not reachable from there. No amount of tuning fixes a waterfall that
  deep; you would have to change the budget.
- **CLS.** Intrinsic dimensions currently ship inside the build. If they arrive
  with the fetched payload, the aspect box cannot exist until the fetch resolves,
  and every image on the page shifts when it does. The 0.02 budget is gone.
- **JS.** The static export ships almost nothing. Runtime fetching needs a data
  layer, loading states and error states, and turns every composite that today
  receives props from a Server Component into a client component. CLAUDE.md §7's
  "Server Components by default, a page is never a client component" inverts.
- **SEO.** Two locales, `sitemap.ts`, `robots.ts`, JSON-LD, per-page metadata. All
  of it derives from content that would no longer exist at build time.

**Fetching at build time** gets the studio everything it actually wants and costs
none of that. The export is still static, the HTML still arrives complete, every
budget in §7 still holds and is still enforceable as written.

> **As built:** the fetch is `scripts/fetch-content.mjs`, running as `prebuild`,
> which writes `src/content/bundle.generated.json`. `lib/content.ts` then imports
> that one file where it used to import six. Doing it in a script rather than
> with a top-level `await` inside `lib/content.ts` keeps every accessor below it
> synchronous — so no page, component or stylesheet changed at all — and turns a
> failed fetch into a plain message from a build step instead of an unhandled
> rejection inside a server component.

The only thing given up is immediacy: content goes live sixty to ninety seconds
after Publish rather than instantly. The current git flow already has exactly that
latency, and nobody has minded, because an atelier publishes a work every few
weeks and not every few seconds.

> **Decided: build-time fetch.** Publish writes a revision and calls a Cloudflare
> deploy hook. The site rebuilds and redeploys itself.

The studio still gets feedback on unpublished work from the preview, which reads
the draft directly — see §7.

---

## 2. The shape

```
┌─ CAFA-Admin ───────────────────────────────── Cloudflare Worker ─┐
│                                                                   │
│   React SPA  ──/api/*──>  Worker  ──binding──>  D1   (content)    │
│   (the studio)                    ──binding──>  R2   (originals)  │
│                                                                   │
│   Publish ──> snapshot draft into a revision                      │
│           └─> POST the deploy hook ──────────────┐                │
└───────────────────────────────────────────────────┼───────────────┘
                                                    ▼
┌─ CAFA-Template ─────────────────────────── Workers Build ─────────┐
│                                                                   │
│   prebuild   fetch-content.mjs ──> /api/content/published         │
│                                └─> content/bundle.generated.json  │
│   next build lib/content.ts       imports it                      │
│              content-schema.ts    parses it, fails the build if bad│
│   next export ──> out/            HTML + CSS + JS, no media       │
│                                                                   │
└───────────────────────────────────────────────────┬───────────────┘
                                                    ▼
                               cafa-studio.com  (static assets Worker)
                              images via /cdn-cgi/image/ from R2
                                    (media.cafa-studio.com)
```

Three properties worth naming, because they are what makes this safe:

1. **The template still has no server runtime.** It is a static export served as
   assets, exactly as today. The backend lives in the other repository. CLAUDE.md
   §1 stays true of the template in every respect but one — where content comes
   from — and that clause needs a precise edit rather than a deletion (§9).
2. **`content-schema.ts` does not change.** It is the same validating gate it is
   today, in the same place, failing the same build. A malformed API response
   cannot reach a page for the same reason a malformed JSON file cannot today.
   This is the safety net that makes the cutover low-risk.
3. **A failed build leaves the previous deploy serving.** Same property as the
   current draft-build model.

---

## 3. Why not AWS

For this workload, "full enterprise on AWS" buys operational surface and monthly
cost, and nothing else. The workload is 10 works, 4 programmes, 6 mentors — about
39 KB of JSON — and 71 images totalling 29 MB, edited by one person.

| | Cloudflare (D1 + R2) | AWS (Aurora/RDS + S3 + CloudFront) |
|---|---|---|
| Database | D1 binding, no connection string | VPC, subnets, security groups, parameter groups |
| Reaching it from a Worker | direct binding | Hyperdrive or a tunnel; a VPC-bound DB is not otherwise reachable |
| Connection pooling | none needed | required |
| Media | R2 binding, **zero egress** | S3 + CloudFront, metered egress |
| Backups | export a 39 KB revision row | snapshots, retention policy, restore drills |
| Monthly | **~$5** (Workers Paid, which the admin needs anyway) | ~$30–60 (cheapest always-on Postgres is $15–30 before anything else) |
| Setup | two entries in `wrangler.jsonc` | IAM, VPC, SG, backups, pooling |

Both repos already deploy on Cloudflare and the admin is already a Worker. D1 and
R2 are two lines of config away; AWS is a second platform, a second bill and a
second set of credentials to rotate, for twenty records.

The honest caveat on D1: it is SQLite with a single primary and read replicas, so
write latency tracks distance to the primary. For one editor saving a few times a
week this is irrelevant. If the site ever needs many concurrent writers or
Postgres-specific features, *that* is the trigger to move — and moving 39 KB of
content is a morning's work. CLAUDE.md §5 says not to build for it now.

**Free-tier headroom** — the numbers are not close:

| | Used | Free tier |
|---|---|---|
| D1 storage | ~39 KB | 5 GB |
| D1 rows read | a few thousand/month | ~150 M/month |
| R2 storage | 29 MB | 10 GB |
| Image transformations | ~355 unique/month | 5,000/month |

---

## 4. The database

Localised text is stored as **paired columns** (`title_zh`, `title_en`), not JSON
and not a translations table. Two locales, fixed, both always required — the
README calls "both languages, always" a core constraint, and paired `NOT NULL`
columns put that constraint in the schema instead of only in a validator. Adding a
third locale becomes a migration, which is correct: CLAUDE.md already says locales
are not editable and adding one is a code change.

```sql
-- One row. Everything hangs off it. This is the seam that makes multi-tenant a
-- migration rather than a rewrite, and it costs one table to leave open.
CREATE TABLE site (
  id             INTEGER PRIMARY KEY CHECK (id = 1),
  name_zh        TEXT NOT NULL,  name_en        TEXT NOT NULL,
  url            TEXT NOT NULL,  -- retired by migration 0002; see below
  contact_email  TEXT NOT NULL,  contact_wechat TEXT NOT NULL,
  address_zh     TEXT NOT NULL,  address_en     TEXT NOT NULL,
  hours_zh       TEXT NOT NULL,  hours_en       TEXT NOT NULL
);

-- The file registry. One row per original in R2. width and height are recorded
-- at upload — which is precisely what lets the frontend reserve the aspect box
-- without the build ever touching image bytes.
CREATE TABLE media (
  key        TEXT PRIMARY KEY,          -- R2 object key, "works/kiln-and-corridor/01.jpg"
  width      INTEGER NOT NULL,
  height     INTEGER NOT NULL,
  bytes      INTEGER NOT NULL,
  created_at TEXT    NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE works (
  slug             TEXT PRIMARY KEY,
  position         INTEGER NOT NULL,    -- editorial order; was array order in works.json
  index_no         INTEGER NOT NULL,    -- the ium running number shown in the list
  title_zh         TEXT NOT NULL,  title_en   TEXT NOT NULL,
  status           TEXT NOT NULL CHECK (status IN ('completed','in-progress','private')),
  year             INTEGER NOT NULL,
  summary_zh       TEXT NOT NULL,  summary_en TEXT NOT NULL,
  cover_key        TEXT NOT NULL REFERENCES media(key),
  cover_alt_zh     TEXT NOT NULL DEFAULT '',
  cover_alt_en     TEXT NOT NULL DEFAULT '',
  cover_decorative INTEGER NOT NULL DEFAULT 0,
  -- CLAUDE.md §10: alt is required. A decorative image says so deliberately;
  -- a half-filled one is refused by the database, not just by the form.
  CHECK (cover_decorative = 1 OR (cover_alt_zh <> '' AND cover_alt_en <> ''))
);

CREATE TABLE work_discipline (
  work_slug TEXT    NOT NULL REFERENCES works(slug) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  zh        TEXT    NOT NULL,  en TEXT NOT NULL,
  PRIMARY KEY (work_slug, position)
);

CREATE TABLE work_credit (
  work_slug TEXT    NOT NULL REFERENCES works(slug) ON DELETE CASCADE,
  position  INTEGER NOT NULL,
  role_zh   TEXT    NOT NULL,  role_en TEXT NOT NULL,
  name_zh   TEXT    NOT NULL,  name_en TEXT NOT NULL,
  PRIMARY KEY (work_slug, position)
);

CREATE TABLE work_media (
  work_slug  TEXT    NOT NULL REFERENCES works(slug) ON DELETE CASCADE,
  position   INTEGER NOT NULL,
  media_key  TEXT    NOT NULL REFERENCES media(key),
  alt_zh     TEXT    NOT NULL DEFAULT '',
  alt_en     TEXT    NOT NULL DEFAULT '',
  decorative INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (work_slug, position),
  CHECK (decorative = 1 OR (alt_zh <> '' AND alt_en <> ''))
);

CREATE TABLE programs (
  slug        TEXT PRIMARY KEY,
  position    INTEGER NOT NULL,
  name_zh     TEXT NOT NULL,  name_en     TEXT NOT NULL,
  audience_zh TEXT NOT NULL,  audience_en TEXT NOT NULL,
  duration_zh TEXT NOT NULL,  duration_en TEXT NOT NULL,
  summary_zh  TEXT NOT NULL,  summary_en  TEXT NOT NULL
);

CREATE TABLE mentors (
  slug                TEXT PRIMARY KEY,
  position            INTEGER NOT NULL,
  name_zh             TEXT NOT NULL,  name_en       TEXT NOT NULL,
  discipline_zh       TEXT NOT NULL,  discipline_en TEXT NOT NULL,
  note_zh             TEXT NOT NULL,  note_en       TEXT NOT NULL,
  portrait_key        TEXT NOT NULL REFERENCES media(key),
  portrait_alt_zh     TEXT NOT NULL DEFAULT '',
  portrait_alt_en     TEXT NOT NULL DEFAULT '',
  portrait_decorative INTEGER NOT NULL DEFAULT 0,
  CHECK (portrait_decorative = 1 OR (portrait_alt_zh <> '' AND portrait_alt_en <> ''))
);

CREATE TABLE site_studio (
  position   INTEGER PRIMARY KEY,
  media_key  TEXT    NOT NULL REFERENCES media(key),
  alt_zh     TEXT    NOT NULL DEFAULT '',
  alt_en     TEXT    NOT NULL DEFAULT '',
  decorative INTEGER NOT NULL DEFAULT 0,
  CHECK (decorative = 1 OR (alt_zh <> '' AND alt_en <> ''))
);
```

> **Since built: `site.url` was the wrong kind of thing.** It came across from
> the JSON files unexamined, where it had been as good a place as any. Behind a
> database it was a duplicate of the `PRODUCTION_URL` var with nothing keeping
> the two equal — and the failure it invited only appears when the domain moves,
> which is the moment nobody is auditing canonical tags. Change the var, forget
> the `UPDATE`, and every canonical, hreflang, `og:url` and sitemap entry keeps
> naming the old host while the build stays green.
>
> `worker/domain/bundle.ts` now stamps `PRODUCTION_URL` into each revision as
> `site.url`, so the template is untouched — it reads the same field from the
> same bundle through the same parse gate. Migration 0002 dropped the column.
> The general shape is worth keeping in mind for anything else that lands in
> this table: **the site's content belongs in D1, the site's deployment does
> not.**

### The dictionaries

The two dictionary files are ~60 nested UI strings each — `meta.title`,
`a11y.skipToContent`, `works.status.completed`, `about.body[]`. Modelling nested
UI copy relationally is a trap. It goes in flat:

```sql
CREATE TABLE copy (
  key TEXT PRIMARY KEY,   -- dotted path: "work.credits", "about.body.0"
  zh  TEXT NOT NULL,
  en  TEXT NOT NULL
);
```

The API flattens on the way in and unflattens on the way out; consecutive integer
segments (`about.body.0`, `about.body.1`) rebuild as an array. Two consequences
worth being deliberate about:

- The admin's copy editor becomes a flat, searchable list of labelled fields,
  which is better than a nested tree to work in.
- **Keys are schema, not data.** A key exists because the template's `Dictionary`
  type has a field for it. The admin may edit values and must not add or remove
  keys; new keys arrive by migration alongside the code that reads them.

> **As built:** the copy table also carries the chrome the site record used to
> hold — `nav.works`, `nav.about` and so on, plus `localeName`. The nav's
> *shape* is code, because the order and the route each item points at are wired
> to the template's `lib/routes.ts`; its *labels* are words on a screen, and the
> studio should be able to rename an item without a deploy. `worker/domain/bundle.ts`
> lifts them back out into `site` when it builds a revision, so the template's
> `Dictionary` type never learns they exist.

---

## 5. Publishing, and what replaces the commit

The draft/main branch pair is replaced by **live tables plus an append-only
revision log**. Saving writes the tables. Publishing snapshots them.

```sql
CREATE TABLE revision (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  content      TEXT NOT NULL,   -- the whole public ContentSet as JSON — exactly
                                -- the bytes the build will consume
  message      TEXT NOT NULL,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  published_by TEXT NOT NULL
);
```

At 39 KB a whole-content snapshot per publish is free, and it buys back most of
what git was providing:

- **Version history and one-click rollback.** Restoring is inserting a new
  revision whose `content` is an old one's. History is never mutated.
- **The build reads exactly one row.** Atomic by construction — no chance of a
  build catching a half-finished save, which the branch model achieved with a
  single commit and this achieves with a single row.
- **"Is it live yet?" survives intact.** `build-info.json` carries
  `{ revision: 42 }` instead of a commit SHA, and the admin compares the latest
  published revision to the number the deployed site reports. Same ground-truth
  check, no host API credentials, one field changed.

### Private works must be stripped at snapshot time

The published endpoint is public (§6), and today `getIndexCovers()` excludes
private works so "no URL for one is ever handed to the browser." That guarantee
currently lives in the frontend. Once the content set is fetchable, it has to move
to where the data leaves the database: **the snapshot reduces a private work to
what the index actually renders** — slug, index, title, status, year, discipline —
and drops its cover and media entirely.

That is stricter than today, and it is the right place for the rule: privacy
enforced at the boundary rather than by every consumer remembering to filter.

---

## 6. Images — the part that gets simpler

This is the one place where the migration removes more than it adds.

Today: `media-source/**` is committed to the template repo; `scripts/build-images.mjs`
runs sharp over 71 originals producing up to 10 derivatives each, writes them to
`public/media/derived`, and emits a committed manifest. An incremental cache keyed
on mtime and size makes local rebuilds fast — but that cache does not survive a
fresh CI container, so every Workers Build would re-encode ~700 derivatives from
scratch. AVIF encoding is slow. That is a five-to-fifteen minute build, every time.

Instead: **originals in R2, transformed on delivery, derived never.**

- Store originals in R2 under the same keys the content uses today.
- Serve through Cloudflare Images transformations —
  `/cdn-cgi/image/width=768,format=auto,fit=scale-down/<origin>/<key>` —
  which picks AVIF or WebP from the `Accept` header and caches the result.
- The build fetches only dimensions, which the admin already recorded at upload.

What that deletes:

| Deleted | Why it can go |
|---|---|
| `scripts/build-images.mjs` | no derivatives to generate |
| `sharp` devDependency | nothing left to encode |
| `src/lib/image-manifest.generated.json` | dimensions come from the content API |
| `src/lib/image-manifest.ts` | ditto |
| `public/media/derived` | nothing is derived at build time |
| `media-source/**` (29 MB) | originals live in R2 |

And what it buys: the prebuild pass disappears, `out/` shrinks to HTML/CSS/JS with
no media in it at all, and deploys stop carrying tens of megabytes.

`Media.tsx` becomes a `srcset` built from `{ key, width, height }` plus the
transform URL pattern — the same five widths, the same `sizes`, the same eager /
`fetchPriority="high"` treatment for the LCP image. `MediaFrame.tsx` is unchanged;
it already takes an entry with intrinsic dimensions and a variant list.

**Three things to verify in Phase 3, not assume:**

1. `format=auto` and `quality=` will not produce byte-identical output to the
   current `avif q55 / webp q78`. Close, tunable, worth eyeballing two or three
   works before cutover.
2. `fit=scale-down` must be used so a 900 px original is never upscaled to 1200 —
   matching what `targetWidths()` does today.
3. Confirm `/cdn-cgi/image/` on the `cafa-studio.com` zone passes through ahead
   of the static-assets Worker. It should — `/cdn-cgi/*` is handled before Workers
   — and keeping images on the primary hostname avoids a second connection on the
   LCP path. The origin they are fetched *from* is `media.cafa-studio.com`, the
   R2 custom domain, which is inside the same zone for the same reason.
   Transformations must be enabled on the zone or every one of these 404s.

---

## 7. The API

| Route | Auth | Purpose |
|---|---|---|
| `GET /api/content` | session | Live draft tables, for the admin |
| `GET /api/content/published` | **public** | Latest revision blob, for the production build |
| `GET /api/content/draft` | preview token | The draft, for the preview build |
| `POST /api/save` | session | Write draft tables in one `batch()` |
| `POST /api/publish` | session | Snapshot → revision → POST deploy hook |
| `POST /api/media` | session | Upload to R2, record dimensions |
| `GET /api/revisions` | session | History |
| `POST /api/revisions/:id/restore` | session | Roll back as a new revision |

**Why the published endpoint is public.** Workers Builds has no session cookie,
and published content is by definition already on the public website — the
revision row only exists because someone pressed Publish. There is nothing to
leak, provided private works are stripped at snapshot time (§5). A shared secret
here would be ceremony, not security.

It is served `no-store` rather than cached. This is read a handful of times a
month, always by a build that has just been told there is something new to read;
a stale hit would publish the previous revision and look exactly like a lost
save. Caching the one request that must not be stale is a poor trade.

> **As built: the preview survived.** Retiring the draft branch would have taken
> "View draft" with it, which is a capability the studio uses rather than an
> artefact of the old model. `/api/content/draft` returns the same bundle built
> from the live tables, gated on a `PREVIEW_TOKEN` header that only the preview
> build holds. So there are two Workers Builds environments and two deploy
> hooks: saving pokes the preview, publishing pokes production. The studio's day
> is unchanged.
>
> The draft has no revision id to report, so it reports an FNV-1a fingerprint of
> its own content instead, and `/api/status` computes the same one. "Is the
> preview showing what I last saved" is then the same comparison as "is the live
> site showing what I published".

**D1 has no interactive transactions.** It has `batch()`, which runs an ordered
statement list atomically. Every save must be expressed as one batch — for
child rows that means `DELETE` followed by `INSERT`s in the same batch, not a
read-modify-write. This is the constraint people trip on; at this scale it costs
nothing to respect.

**New secrets:** `DEPLOY_HOOK_URL`. **New bindings:** `DB` (D1), `MEDIA` (R2).
`GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` / `SESSION_SECRET` all stay — GitHub
OAuth remains the sign-in, it simply no longer carries a `repo` scope, which means
the token stops being a credential that can write code. Narrowing that scope to
`read:user` is a security improvement that falls out of this for free.

---

## 8. Phases

Ordered so the live site is never in a broken state, and each phase is revertible
on its own.

**Phase 0 — Foundations.** Create the D1 database and R2 bucket. Write the schema
migration. Write a one-shot importer that reads the six current JSON files plus
`media-source/**` and populates both. Run it, check row counts against the JSON.
*Nothing is deployed; the live site is untouched.*

**Phase 1 — The admin talks to D1.** Replace `worker/github.ts` with `worker/db.ts`
and `worker/media.ts`. `session.ts` is unchanged. The SPA, the editors and
`content/validate.ts` are unchanged — they operate on a `ContentSet`, and the API
still returns one. Publish becomes snapshot-plus-deploy-hook. *The template still
builds from its committed JSON; the live site is untouched.* This is the largest
piece of work and all of it is inside one Worker.

**Phase 2 — The template fetches.** `lib/content.ts` swaps six imports for one
fetch. `content-schema.ts` does not change. Verify a build produces byte-identical
HTML to the current one — the content is the same content, so it should, and any
diff is a bug worth finding before cutover. *Reversible by reverting one file.*

**Phase 3 — Images.** Delete the sharp pipeline, rewrite `Media.tsx` against the
transform URL, remove `media-source/` from the repo. Verify the three items in §6.
Re-measure LCP and CLS against the §7 budgets before merging.

**Phase 4 — Cutover and cleanup.** Wire the deploy hook. Retire the `draft`
branch and the branch-comparison endpoints. `build-info.json` carries the
revision. Narrow the OAuth scope. Amend the two documents in §9.

Risk sits almost entirely in Phase 2, and it is bounded by the property named in
§2: a bad payload fails `content-schema.ts`, which fails the build, which leaves
the previous deploy serving. That is the same protection the draft-build model
gives today.

---

## 9. What has to change in the constitution

CLAUDE.md is explicit that a request conflicting with it should be named rather
than silently worked around. This one conflicts in two places, and both want a
precise edit rather than a deletion — because the architecture chosen in §1
preserves nearly all of what those clauses were protecting.

**CLAUDE.md §1** — "There is no backend, no database, no auth, no API routes, no
server runtime." Still true of the template in every respect but one. It should
say that the template ships no server runtime and no client-side data fetching,
and that its content arrives at build time from the admin's API. The performance
budgets in §7 remain enforceable exactly as written, which is the whole reason to
keep the sentence rather than strike it.

**Architecture.md §7** — "No CMS, no `getStaticProps`-style data fetching, no API
routes." The distinction to draw is build-time versus runtime: there is still no
runtime data fetching, and no API route *in the template*.

**CLAUDE.md §4** gets stronger rather than weaker. "Adding a new work must require
editing exactly one content file and adding image files. Zero code changes."
becomes "adding a new work must require nothing but the admin UI."

---

## 10. Cost

| | Monthly |
|---|---|
| Workers Paid (admin Worker; needed regardless) | $5 |
| D1 — 39 KB against a 5 GB free tier | $0 |
| R2 — 29 MB against 10 GB, zero egress | $0 |
| Image transformations — ~355 unique against 5,000 | $0 |
| **Total** | **~$5** |

Against roughly $30–60/month for the AWS shape, before anyone's time.

---

## 11. Still to decide

None of these block Phase 0.

1. **Media deletion.** When a work is deleted, does its R2 object go too? Suggest
   no: orphans cost nothing at this volume, and an accidental deletion that took
   the photographs with it is unrecoverable. Sweep manually if it ever matters.
2. **Revision retention.** Suggest keeping all of them. At 39 KB each, a thousand
   publishes is 39 MB.
3. **Draft preview.** Rendering the live tables inside the admin is the plan.
   Worth confirming that a preview inside the admin panel is enough, or whether
   the studio expects a preview at a real URL that looks like the site.
4. **Locking.** One editor today, so no conflict handling is proposed. If a second
   person ever edits, the revision counter is the natural place to detect a
   stale write.
