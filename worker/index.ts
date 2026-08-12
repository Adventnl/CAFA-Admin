/**
 * The server half of the admin — composition root and nothing else.
 *
 * It holds two things the browser must not: the session, and the only writable
 * handle on the content. What is left in this file is the wiring: build the
 * services, build the controllers, declare the routes, dispatch. Every question
 * about *what* a route does is answered one layer down.
 *
 *   controllers/   HTTP in, HTTP out. No SQL, no bucket, no business rule.
 *   services/      The rules. Throw ApiException; never build a Response.
 *   repositories/  D1. Rows in, domain objects out.
 *   storage/       R2.
 *   domain/        Pure: the bundle projection, the cookie seal, image headers.
 *   shared/        The envelope, the exception, the filter, the router.
 *
 * Dependencies point down only. A repository has never heard of a Request.
 */
import { AuthController } from './controllers/auth.controller';
import { ContentController } from './controllers/content.controller';
import { MediaController } from './controllers/media.controller';
import { PublicContentController } from './controllers/public-content.controller';
import { PublishController } from './controllers/publish.controller';
import { RevisionsController } from './controllers/revisions.controller';
import { SessionController } from './controllers/session.controller';
import { readSession } from './domain/session';
import type { Env } from './env';
import { AuthService } from './services/auth.service';
import { ContentService } from './services/content.service';
import { DeployService } from './services/deploy.service';
import { MediaService } from './services/media.service';
import { PublishService } from './services/publish.service';
import { ApiException } from './shared/api-exception';
import { ApiResponse, toResponse } from './shared/api-response';
import { applyExceptionFilter } from './shared/exception-filter';
import { Router } from './shared/router';

/**
 * The container, such as it is.
 *
 * Built per request, which is what a scoped lifetime means in a framework that
 * has one. It costs a handful of object allocations and no I/O — every service
 * here is a closure over bindings — and it buys the thing that matters: nothing
 * is shared between two requests by accident.
 */
function compose(env: Env): Router {
  const deploy = new DeployService(env);
  const auth = new AuthService(env);

  const content = new ContentService(env.DB, deploy);
  const media = new MediaService(env.DB, env.MEDIA);
  const publishing = new PublishService(env, deploy);

  const authController = new AuthController(auth, env.SESSION_SECRET);
  const sessionController = new SessionController();
  const contentController = new ContentController(content);
  const mediaController = new MediaController(media);
  const publishController = new PublishController(publishing);
  const revisionsController = new RevisionsController(publishing);
  const publicController = new PublicContentController(publishing, auth);

  return (
    new Router()
      // Browser navigations. GitHub is the sign-in; the account check is inside.
      .allowAnonymous('GET', '/auth/login', authController.login)
      .allowAnonymous('GET', '/auth/callback', authController.callback)
      .allowAnonymous('GET', '/auth/logout', authController.logout)

      // The two build-time reads. Unwrapped on purpose — see the controller.
      .allowAnonymous('GET', '/api/content/published', publicController.published)
      .allowAnonymous('GET', '/api/content/draft', publicController.draft)

      // Everything the editor does.
      .authorize('GET', '/api/session', sessionController.whoami)
      .authorize('GET', '/api/content', contentController.get)
      .authorize('POST', '/api/save', contentController.save)
      .authorize('GET', '/api/media', mediaController.get)
      .authorize('POST', '/api/media', mediaController.upload)
      .authorize('GET', '/api/status', publishController.status)
      .authorize('POST', '/api/publish', publishController.publish)
      .authorize('GET', '/api/revisions', revisionsController.list)
      .authorize('POST', '/api/revisions/:id/restore', revisionsController.restore)
  );
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const matched = compose(env).resolve(request, url);

    if (matched === null) {
      // An unclaimed /api path is a mistake worth naming. Anything else is a
      // client route, and the SPA's asset handler owns it.
      return url.pathname.startsWith('/api/')
        ? toResponse(ApiResponse.fail(404, 'No such endpoint.'))
        : env.ASSETS.fetch(request);
    }

    if (matched.kind === 'method-not-allowed') {
      return toResponse(
        ApiResponse.fail(405, `That endpoint takes ${matched.allowed.join(' or ')}.`),
        { Allow: matched.allowed.join(', ') },
      );
    }

    return applyExceptionFilter(async () => {
      const context = { request, url, params: matched.params };
      if (matched.kind === 'anonymous') return matched.handler(context);

      const session = await readSession(request, env.SESSION_SECRET);
      if (session === null) throw ApiException.unauthorized('Not signed in.');

      return matched.handler({ ...context, user: { login: session.login } });
    });
  },
} satisfies ExportedHandler<Env>;
