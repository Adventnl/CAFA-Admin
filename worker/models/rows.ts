/**
 * The tables, as TypeScript sees them.
 *
 * One interface per table, named for it, holding the column names exactly. They
 * live together because they are one schema and reading them side by side is
 * how you check a migration against the code — the equivalent of opening
 * veyra_api's `TalentDbContext` and seeing every entity in one screen.
 *
 * Nothing above worker/repositories/ imports from this file. A service works in
 * `ContentSet`, `Work`, `Mentor`; the shape with `_zh` and `_en` suffixes stops
 * at the repository boundary.
 */

export interface SiteRow {
  name_zh: string;
  name_en: string;
  contact_email: string;
  contact_wechat: string;
  address_zh: string;
  address_en: string;
  hours_zh: string;
  hours_en: string;
}

export interface StudioRow {
  media_key: string;
  alt_zh: string;
  alt_en: string;
  decorative: number;
}

export interface WorkRow {
  slug: string;
  index_no: number;
  title_zh: string;
  title_en: string;
  status: string;
  year: number;
  summary_zh: string;
  summary_en: string;
  cover_key: string;
  cover_alt_zh: string;
  cover_alt_en: string;
  cover_decorative: number;
}

export interface DisciplineRow {
  work_slug: string;
  zh: string;
  en: string;
}

export interface CreditRow {
  work_slug: string;
  role_zh: string;
  role_en: string;
  name_zh: string;
  name_en: string;
}

export interface WorkMediaRow {
  work_slug: string;
  media_key: string;
  alt_zh: string;
  alt_en: string;
  decorative: number;
}

export interface ProgramRow {
  slug: string;
  name_zh: string;
  name_en: string;
  audience_zh: string;
  audience_en: string;
  duration_zh: string;
  duration_en: string;
  summary_zh: string;
  summary_en: string;
}

export interface MentorRow {
  slug: string;
  name_zh: string;
  name_en: string;
  discipline_zh: string;
  discipline_en: string;
  note_zh: string;
  note_en: string;
  portrait_key: string;
  portrait_alt_zh: string;
  portrait_alt_en: string;
  portrait_decorative: number;
}

export interface CopyRow {
  key: string;
  zh: string;
  en: string;
}

export interface MediaRow {
  key: string;
  width: number;
  height: number;
  bytes: number;
}

export interface RevisionRow {
  id: number;
  content: string;
  message: string;
  published_at: string;
  published_by: string;
}
