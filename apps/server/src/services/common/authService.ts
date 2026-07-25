import type { IncomingHttpHeaders } from 'node:http';
import { fromNodeHeaders } from 'better-auth/node';
import type { AuthClient } from '@/clients/authClient.js';
import { ApiError } from '@/utils/errors/apiError.js';

export interface AuthContext {
  userId: string;
}

interface AuthServiceDeps {
  authClient: AuthClient;
}

export class AuthService {
  private deps: AuthServiceDeps;

  constructor(deps: AuthServiceDeps) {
    this.deps = deps;
  }

  /**
   * Resolve the caller from their bearer token via Better Auth's session. The token comes
   * from sign-in (`set-auth-token`); the returned `user.id` is what RLS scopes rows to.
   */
  async authenticate(headers: IncomingHttpHeaders): Promise<AuthContext> {
    const result = await this.deps.authClient.auth.api.getSession({
      headers: fromNodeHeaders(headers),
    });
    if (!result) throw new ApiError('unauthorized', 'Missing or invalid session');
    return { userId: result.user.id };
  }
}
