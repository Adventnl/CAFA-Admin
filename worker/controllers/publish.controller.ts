/**
 * GET /api/status, POST /api/publish
 *
 * Two routes, one question: what is on the public site, and how far ahead of it
 * is the draft.
 */
import {
  parsePublishRequest,
  type PublishResponse,
  type StatusResponse,
} from '../models/dtos/publish.dtos';
import type { PublishService } from '../services/publish.service';
import { ApiResponse } from '../shared/api-response';
import type { AuthorizedContext } from '../shared/router';

export class PublishController {
  constructor(private readonly publishing: PublishService) {}

  status = async (): Promise<ApiResponse<StatusResponse>> => {
    return ApiResponse.ok(await this.publishing.status());
  };

  publish = async ({ request, user }: AuthorizedContext): Promise<ApiResponse<PublishResponse>> => {
    // An empty body is normal — the studio's Publish button sends no message.
    const body: unknown = await request.json().catch(() => ({}));
    const result = await this.publishing.publish(user, parsePublishRequest(body));

    return ApiResponse.ok(result, result.published ? 'Published.' : (result.reason ?? 'Nothing to publish.'));
  };
}
