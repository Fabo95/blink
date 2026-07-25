import { asValue } from 'awilix';
import { auth } from '@/setup/auth/auth.js';
import { getDb } from '@/setup/database/db.js';
import type { SingletonRegistrations } from './types.js';

/**
 * App-lifetime singletons — one instance for the whole process, registered on
 * the root container so every request scope inherits the same reference.
 */
export function createSingletonCradle(): SingletonRegistrations {
  return {
    db: asValue(getDb()),
    auth: asValue(auth),
  };
}
