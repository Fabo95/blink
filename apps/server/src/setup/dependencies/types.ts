import type { BlinkDb } from '@blink/db/client';
import type { Cradle, RequestCradle } from '@fastify/awilix';
import type { NameAndRegistrationPair } from 'awilix';
import type { AuthClient } from '@/clients/authClient.js';
import type { EmailClient } from '@/clients/emailClient.js';
import type { AuthService } from '@/services/common/authService.js';
import type { KeysetService } from '@/services/common/keysetService.js';
import type { SyncService } from '@/services/common/syncService.js';
import type { KeysetsModelService } from '@/services/model/keysetsModelService.js';
import type { RecordsModelService } from '@/services/model/recordsModelService.js';

declare module '@fastify/awilix' {
  // App-lifetime singletons — resolved once, shared across every request.
  interface Cradle {
    db: BlinkDb;
    emailClient: EmailClient;
    authClient: AuthClient;
  }
  // Per-request services — awilix builds a fresh graph per `req.diScope`.
  interface RequestCradle {
    recordsModelService: RecordsModelService;
    keysetsModelService: KeysetsModelService;
    authService: AuthService;
    syncService: SyncService;
    keysetService: KeysetService;
  }
}

export type SingletonRegistrations = Required<NameAndRegistrationPair<Cradle>>;
export type RequestRegistrations = Required<NameAndRegistrationPair<RequestCradle>>;
