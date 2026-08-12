/**
 * Reading and saving the draft.
 *
 * Saving writes the live tables. That *is* the draft — it is what the preview
 * build reads, and it is what a publish later snapshots. So the only two things
 * a save does beyond the write are the parts that make it safe and visible:
 * validate first, poke the preview after.
 *
 * The validation is the same `checkContent` the editor's form runs. Running it
 * again here is not belt-and-braces — it is the only copy that cannot be
 * skipped by a client that has been edited, replaced or scripted.
 */
import type { ContentSet } from '../../src/content/types';
import type { ContentResponse } from '../models/dtos/content.dtos';
import { checkContent } from '../../src/content/validate';
import { readContent, writeContent } from '../repositories/content.repository';
import { readMedia } from '../repositories/media.repository';
import { ApiException } from '../shared/api-exception';
import type { DeployService } from './deploy.service';

export class ContentService {
  constructor(
    private readonly db: D1Database,
    private readonly deploy: DeployService,
  ) {}

  async read(): Promise<ContentResponse> {
    const [content, media] = await Promise.all([readContent(this.db), readMedia(this.db)]);
    return { content, media };
  }

  async save(content: ContentSet): Promise<void> {
    const problems = checkContent(content);
    if (problems.length > 0) {
      const noun = problems.length === 1 ? 'field needs' : 'fields need';
      throw ApiException.unprocessable(
        `${problems.length} ${noun} fixing before this can be saved.`,
        problems,
      );
    }

    try {
      await writeContent(this.db, content);
    } catch (error) {
      // A shape the validator accepts but the schema refuses — a missing media
      // row behind an image, most likely. Worth the real message.
      throw ApiException.badRequest(
        error instanceof Error ? error.message : 'The save was refused.',
      );
    }

    await this.deploy.pokePreview();
  }
}
