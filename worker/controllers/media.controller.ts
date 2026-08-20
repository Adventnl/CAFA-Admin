/**
 * GET /api/media, POST /api/media
 *
 * The GET is the only route in the admin that answers with something other than
 * an envelope, because what it returns is a photograph. The editor points an
 * `<img src>` at it.
 */
import { parseMediaKey, parseTint, type UploadMediaResponse } from '../models/dtos/media.dtos';
import { contentTypeOf } from '../domain/image';
import type { MediaService } from '../services/media.service';
import { ApiResponse } from '../shared/api-response';
import type { AuthorizedContext } from '../shared/router';

export class MediaController {
  constructor(private readonly media: MediaService) {}

  get = async ({ url }: AuthorizedContext): Promise<Response> => {
    const key = parseMediaKey(url);
    const object = await this.media.fetch(key);

    return new Response(object.body, {
      headers: {
        'Content-Type': contentTypeOf(key),
        // Keyed by nothing but the path, so a replaced photograph needs a
        // cache-buster from the client. It appends one on save.
        'Cache-Control': 'private, max-age=60',
      },
    });
  };

  /**
   * The bytes arrive as the request body rather than in a JSON envelope: base64
   * costs a third again in size for no benefit now that there is no git blob at
   * the other end. Which leaves the query string as the only place for the two
   * things that are not bytes — where the photograph is filed, and the hue the
   * browser read out of it while it was resizing it.
   */
  upload = async ({ request, url }: AuthorizedContext): Promise<ApiResponse<UploadMediaResponse>> => {
    const key = parseMediaKey(url);
    const tint = parseTint(url);
    const uploaded = await this.media.upload(key, await request.arrayBuffer(), tint);
    return ApiResponse.ok(uploaded, 'Uploaded.');
  };
}
