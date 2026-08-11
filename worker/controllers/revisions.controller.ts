/**
 * GET /api/revisions, POST /api/revisions/:id/restore
 *
 * History, and the one thing you can do with it. Restoring does not mutate
 * anything — it publishes an old snapshot as a new revision — so this is two
 * reads and an append, and there is no destructive route to guard.
 */
import { parseRevisionId, type PublishResponse } from '../models/dtos/publish.dtos';
import type { RevisionSummary } from '../repositories/revision.repository';
import type { PublishService } from '../services/publish.service';
import { ApiResponse } from '../shared/api-response';
import type { AuthorizedContext } from '../shared/router';

export class RevisionsController {
  constructor(private readonly publishing: PublishService) {}

  list = async (): Promise<ApiResponse<RevisionSummary[]>> => {
    return ApiResponse.ok(await this.publishing.history());
  };

  restore = async ({ params, user }: AuthorizedContext): Promise<ApiResponse<PublishResponse>> => {
    const id = parseRevisionId(params.id);
    return ApiResponse.ok(await this.publishing.restore(user, id), `Restored revision ${id}.`);
  };
}
