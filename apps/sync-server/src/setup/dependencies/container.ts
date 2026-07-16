import { AuthService } from '@/services/common/authService.js';
import { SyncService } from '@/services/common/syncService.js';
import { TasksModelService } from '@/services/model/tasksModelService.js';
import { getDb } from '@/setup/database/db.js';
import type { Services } from './types.js';

/**
 * Wires the service graph once at startup (model → common). A plain factory
 * instead of a DI container — three services don't warrant Awilix.
 */
export function createServices(): Services {
  const tasksModelService = new TasksModelService({ db: getDb() });
  const authService = new AuthService();
  const syncService = new SyncService({ tasksModelService });

  return { tasksModelService, authService, syncService };
}
