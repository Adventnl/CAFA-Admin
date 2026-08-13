/**
 * The envelope every authenticated endpoint answers in.
 *
 * Four fields, the same four veyra_api's `Shared/Models/ApiResponse.cs` uses:
 * `success` is what a client branches on, `code` mirrors the HTTP status so a
 * caller that only has the body still knows what happened, `msg` is safe to put
 * in front of a person, and `data` is the payload or null.
 *
 * The one field veyra does not have is `problems`, and it earns its place: this
 * admin's entire job is refusing a save that would produce content the site
 * cannot build, and "which field, on which record" is the answer the editor
 * draws. Folding that into `msg` would make the client parse prose.
 *
 * The two build-time endpoints are deliberately *not* wrapped — see
 * worker/controllers/public-content.controller.ts for why.
 */
import type { Problem } from '../../src/content/validate';

export interface ApiResponse<T> {
  success: boolean;
  data: T | null;
  code: number;
  msg: string;
  /** Field-level detail on a rejected save. Absent on success. */
  problems?: Problem[];
}

export const ApiResponse = {
  ok<T>(data: T, msg = 'Success'): ApiResponse<T> {
    return { success: true, data, code: 200, msg };
  },

  fail(code: number, msg: string, problems?: Problem[]): ApiResponse<never> {
    return problems === undefined
      ? { success: false, data: null, code, msg }
      : { success: false, data: null, code, msg, problems };
  },
};

/**
 * What a controller action may return.
 *
 * Most return an envelope and let the dispatcher serialise it. The handful that
 * cannot — the two that set a cookie, the bytes of a photograph, the raw bundle
 * a build reads — return a `Response` directly, which is the same escape hatch
 * `IActionResult` gives a veyra controller.
 */
export type ActionResult = ApiResponse<unknown> | Response;

export function isResponse(result: ActionResult): result is Response {
  return result instanceof Response;
}

/** An envelope on the wire. The HTTP status and `code` are always the same. */
export function toResponse(
  result: ApiResponse<unknown>,
  headers: Record<string, string> = {},
): Response {
  return new Response(JSON.stringify(result), {
    status: result.code,
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}
