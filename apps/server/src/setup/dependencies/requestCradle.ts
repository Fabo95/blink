import { asClass } from 'awilix';
import { AuthService } from '@/services/common/authService.js';
import { SyncService } from '@/services/common/syncService.js';
import { TasksModelService } from '@/services/model/tasksModelService.js';
import type { RequestRegistrations } from './types.js';

/**
 * Per-request services. `.scoped()` means awilix builds each one once per
 * `req.diScope` and caches it for that request; PROXY injection hands every
 * constructor the cradle, so a service just destructures the deps it names
 * (`{ db }`, `{ authClient }`, `{ tasksModelService }`) and awilix resolves them.
 */
export function createRequestCradle(): RequestRegistrations {
  return {
    tasksModelService: asClass(TasksModelService).scoped(),
    authService: asClass(AuthService).scoped(),
    syncService: asClass(SyncService).scoped(),
  };
}
