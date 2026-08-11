/**
 * The whole content set, as one unit of work.
 *
 * Each aggregate repository beside this one knows its own tables and nothing
 * else. This file is the only place that knows there are five of them, and it
 * exists for one reason: a save has to be atomic. D1 has no interactive
 * transactions, so a write is one `batch()` — which means the aggregates cannot
 * each run their own, they have to hand over statements and let this compose
 * them.
 *
 * **The ordering is the invariant.** Every delete runs before every insert, and
 * within an aggregate children go before parents on the way out and after them
 * on the way in. That is why no statement in the batch ever leaves a dangling
 * reference, and why none of this needs `defer_foreign_keys`. The aggregates do
 * not reference each other — only the `media` registry, which this never
 * touches — so the order *between* the groups below is free.
 *
 * At roughly twenty records a whole-content replace is both simpler than
 * diffing and immune to the ordering bugs diffing invites.
 */
import type { ContentSet } from '../../src/content/types';
import { deleteCopy, insertCopy, readCopy } from './copy.repository';
import { deleteMentors, insertMentors, readMentors } from './mentors.repository';
import { deletePrograms, insertPrograms, readPrograms } from './programs.repository';
import { deleteSite, insertSite, readSite } from './site.repository';
import { deleteWorks, insertWorks, readWorks } from './works.repository';

export async function readContent(db: D1Database): Promise<ContentSet> {
  const [site, works, programs, mentors, copy] = await Promise.all([
    readSite(db),
    readWorks(db),
    readPrograms(db),
    readMentors(db),
    readCopy(db),
  ]);

  return { site, works, programs, mentors, zh: copy.zh, en: copy.en };
}

export async function writeContent(db: D1Database, content: ContentSet): Promise<void> {
  await db.batch([
    ...deleteWorks(db),
    ...deleteSite(db),
    ...deletePrograms(db),
    ...deleteMentors(db),
    ...deleteCopy(db),

    ...insertSite(db, content.site),
    ...insertWorks(db, content.works),
    ...insertPrograms(db, content.programs),
    ...insertMentors(db, content.mentors),
    ...insertCopy(db, { zh: content.zh, en: content.en }),
  ]);
}
