/**
 * GET /api/content, POST /api/save
 *
 * The content set goes over whole in both directions. It is 39 KB, and sending
 * all of it is simpler than describing which parts changed and cheaper than
 * getting that description wrong.
 */
import { parseSaveRequest, type ContentResponse, type SavedResponse } from '../models/dtos/content.dtos';
import type { ContentService } from '../services/content.service';
import { ApiResponse } from '../shared/api-response';
import type { AuthorizedContext } from '../shared/router';

export class ContentController {
  constructor(private readonly content: ContentService) {}

  get = async (): Promise<ApiResponse<ContentResponse>> => {
    return ApiResponse.ok(await this.content.read());
  };

  save = async ({ request }: AuthorizedContext): Promise<ApiResponse<SavedResponse>> => {
    const content = parseSaveRequest(await request.json());
    await this.content.save(content);
    return ApiResponse.ok({ saved: true as const }, 'Saved.');
  };
}
