import type { AuthService } from '@/services/common/authService.js';
import type { SyncService } from '@/services/common/syncService.js';
import type { TasksModelService } from '@/services/model/tasksModelService.js';

/** The plain service container attached to the Fastify instance. */
export interface Services {
  tasksModelService: TasksModelService;
  authService: AuthService;
  syncService: SyncService;
}
