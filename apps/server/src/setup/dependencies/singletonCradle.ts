import { asClass, asValue } from 'awilix';
import { AuthClient } from '@/clients/authClient.js';
import { EmailClient } from '@/clients/emailClient.js';
import { getDb } from '@/setup/database/db.js';
import type { SingletonRegistrations } from './types.js';

/**
 * App-lifetime singletons — one instance for the whole process, registered on the
 * root container so every request scope inherits the same reference. The client
 * classes are `.singleton()` (constructed once); `AuthClient` gets `db` + `emailClient`
 * via awilix PROXY injection.
 */
export function createSingletonCradle(): SingletonRegistrations {
  return {
    db: asValue(getDb()),
    emailClient: asClass(EmailClient).singleton(),
    authClient: asClass(AuthClient).singleton(),
  };
}
