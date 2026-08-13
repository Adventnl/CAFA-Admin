/**
 * Where every throw becomes a response.
 *
 * The direct counterpart of veyra_api's `GlobalExceptionFilter`. Controllers
 * and services never build an error response themselves — they throw, and this
 * is the single place that decides what a thrown thing looks like on the wire.
 *
 * The default arm is deliberately 500 with the real message. This is a
 * one-person admin behind a password; an operator reading the true cause in the
 * network tab is worth more than hiding it from an attacker who would have to
 * be signed in as the studio to see it at all.
 */
import { ApiException } from './api-exception';
import { ApiResponse, isResponse, toResponse, type ActionResult } from './api-response';

export async function applyExceptionFilter(
  action: () => Promise<ActionResult>,
): Promise<Response> {
  try {
    const result = await action();
    return isResponse(result) ? result : toResponse(result);
  } catch (error) {
    return toResponse(describe(error));
  }
}

function describe(error: unknown): ApiResponse<never> {
  if (error instanceof ApiException) {
    return ApiResponse.fail(error.code, error.message, error.problems);
  }
  if (error instanceof SyntaxError) {
    // Nothing else in the request path parses anything; this is always a
    // malformed JSON body, which is the client's mistake rather than ours.
    return ApiResponse.fail(400, 'That request body was not valid JSON.');
  }
  return ApiResponse.fail(500, error instanceof Error ? error.message : 'Something failed.');
}
