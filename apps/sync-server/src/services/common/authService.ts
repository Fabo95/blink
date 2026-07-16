import { ApiError } from '@/utils/errors/index.js';

export interface AuthContext {
  userId: string;
}

export class AuthService {
  /**
   * Resolve the caller from an `Authorization: Bearer <token>` header.
   *
   * TODO(phase-3): verify the tenant IdP's JWT (Okta / Azure AD / Google
   * Workspace) against its JWKS and read `sub`. For local dev the token *is*
   * the user id.
   */
  authenticate(authorization: string | undefined): AuthContext {
    if (!authorization?.startsWith('Bearer ')) {
      throw new ApiError('unauthorized', 'Missing or invalid bearer token');
    }
    const token = authorization.slice('Bearer '.length).trim();
    if (!token) throw new ApiError('unauthorized', 'Empty bearer token');
    return { userId: token };
  }
}
