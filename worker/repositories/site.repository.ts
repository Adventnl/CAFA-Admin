/**
 * The site row, and the studio photographs beside it.
 *
 * One row, by construction — `id INTEGER PRIMARY KEY CHECK (id = 1)`. That
 * constraint is the seam that makes multi-tenant a migration rather than a
 * rewrite, and it costs one table to leave open.
 *
 * `nav`, `locales` and `url` are not here. They are wired to the template's
 * lib/routes.ts and to the deployment, and are added when a revision is built.
 */
import type { SiteContent } from '../../src/content/types';
import type { SiteRow, StudioRow } from '../models/rows';
import { imageBindings, imageRef, pair } from './mapping';

export async function readSite(db: D1Database): Promise<SiteContent> {
  const [site, studio] = await Promise.all([
    db.prepare('SELECT * FROM site WHERE id = 1').first<SiteRow>(),
    db.prepare('SELECT * FROM site_studio ORDER BY position').all<StudioRow>(),
  ]);

  if (site === null) throw new Error('The site row is missing. Has the seed been run?');

  return {
    name: pair(site.name_zh, site.name_en),
    studio: studio.results.map((row) =>
      imageRef(row.media_key, row.alt_zh, row.alt_en, row.decorative),
    ),
    contact: {
      email: site.contact_email,
      wechat: site.contact_wechat,
      address: pair(site.address_zh, site.address_en),
      hours: pair(site.hours_zh, site.hours_en),
    },
  };
}

export function deleteSite(db: D1Database): D1PreparedStatement[] {
  return [db.prepare('DELETE FROM site_studio'), db.prepare('DELETE FROM site')];
}

export function insertSite(db: D1Database, site: SiteContent): D1PreparedStatement[] {
  const statements: D1PreparedStatement[] = [
    db
      .prepare(
        `INSERT INTO site (id, name_zh, name_en, contact_email, contact_wechat,
                           address_zh, address_en, hours_zh, hours_en)
         VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?)`,
      )
      .bind(
        site.name.zh,
        site.name.en,
        site.contact.email,
        site.contact.wechat,
        site.contact.address.zh,
        site.contact.address.en,
        site.contact.hours.zh,
        site.contact.hours.en,
      ),
  ];

  site.studio.forEach((image, at) => {
    statements.push(
      db
        .prepare(
          `INSERT INTO site_studio (position, media_key, alt_zh, alt_en, decorative)
           VALUES (?, ?, ?, ?, ?)`,
        )
        .bind(at, ...imageBindings(image)),
    );
  });

  return statements;
}
