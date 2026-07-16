import type { IncomingMessage } from 'node:http';

/** The authenticated principal derived from the request's bearer token. */
export interface AuthContext {
  userId: string;
}

/**
 * Resolve the caller from the `Authorization: Bearer <token>` header.
 *
 * TODO(phase-3): verify the JWT against the tenant's IdP (Okta / Azure AD /
 * Google Workspace) JWKS and read `sub` as the user id. Until then we accept a
 * raw user-id bearer for local development so the sync path is exercisable.
 */
export function authenticate(req: IncomingMessage): AuthContext | null {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;

  const token = header.slice('Bearer '.length).trim();
  if (!token) return null;

  // Dev shortcut: the token *is* the user id. Replace with real JWT verification.
  return { userId: token };
}
