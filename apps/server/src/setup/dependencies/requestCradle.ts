import { asClass } from 'awilix';
import { AuthService } from '@/services/common/authService.js';
import { KeysetService } from '@/services/common/keysetService.js';
import { SyncService } from '@/services/common/syncService.js';
import { KeysetsModelService } from '@/services/model/keysetsModelService.js';
import { RecordsModelService } from '@/services/model/recordsModelService.js';
import type { RequestRegistrations } from './types.js';

/**
 * Per-request services. `.scoped()` means awilix builds each one once per
 * `req.diScope` and caches it for that request; PROXY injection hands every
 * constructor the cradle, so a service just destructures the deps it names
 * (`{ db }`, `{ authClient }`, `{ recordsModelService }`) and awilix resolves them.
 */
export function createRequestCradle(): RequestRegistrations {
  return {
    recordsModelService: asClass(RecordsModelService).scoped(),
    keysetsModelService: asClass(KeysetsModelService).scoped(),
    authService: asClass(AuthService).scoped(),
    syncService: asClass(SyncService).scoped(),
    keysetService: asClass(KeysetService).scoped(),
  };
}
