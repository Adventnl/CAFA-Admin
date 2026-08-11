/**
 * GET /api/session
 *
 * The editor's first call. It answers 401 through the normal filter when there
 * is no session, which is how the client tells "signed out" from "broken".
 */
import type { SessionResponse } from '../models/dtos/session.dtos';
import { ApiResponse } from '../shared/api-response';
import type { AuthorizedContext } from '../shared/router';

export class SessionController {
  whoami = ({ user }: AuthorizedContext): ApiResponse<SessionResponse> => {
    return ApiResponse.ok({ login: user.login });
  };
}
