/**
 * Who is making the request.
 *
 * veyra_api's `ICurrentUserContext` carries a user id, an agency and a role,
 * because it is multi-tenant and role-scoped. This one carries a login, because
 * the whole access-control model is "did they know the studio's password" and
 * that question is settled once, at sign-in, before a session is ever issued.
 * Every authorised route therefore sees the same user.
 *
 * It exists as a named type rather than a bare string so that the day a second
 * editor or a read-only role arrives, the thing to widen is obvious and every
 * controller already takes it.
 */
export interface CurrentUser {
  login: string;
}
