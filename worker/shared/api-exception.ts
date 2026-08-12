/**
 * The one exception a service is allowed to throw on purpose.
 *
 * veyra_api's `BusinessException` carries an HTTP code alongside its message so
 * a service can say "404, no such revision" without knowing it is inside a web
 * request, and the filter turns that into a response. This is the same idea:
 * anything a service throws deliberately is an ApiException, and anything else
 * reaching the filter is a bug and answers 500.
 */
import type { Problem } from '../../src/content/validate';

export class ApiException extends Error {
  constructor(
    readonly code: number,
    message: string,
    /** Set when the content was refused field by field rather than wholesale. */
    readonly problems?: Problem[],
  ) {
    super(message);
    this.name = 'ApiException';
  }

  static badRequest(message: string): ApiException {
    return new ApiException(400, message);
  }

  static unauthorized(message: string): ApiException {
    return new ApiException(401, message);
  }

  static notFound(message: string): ApiException {
    return new ApiException(404, message);
  }

  /** A save the validator refused. 422 because the shape was fine and the values were not. */
  static unprocessable(message: string, problems: Problem[]): ApiException {
    return new ApiException(422, message, problems);
  }
}
