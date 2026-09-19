import type { BlinkDb } from '@blink/db/client';
import type { Cradle, RequestCradle } from '@fastify/awilix';
import type { NameAndRegistrationPair } from 'awilix';
import type { AuthClient } from '@/clients/authClient.js';
import type { EmailClient } from '@/clients/emailClient.js';
import type { OpenAiClient } from '@/clients/openaiClient.js';
import type { AuthService } from '@/services/common/authService.js';
import type { CaptureService } from '@/services/common/captureService.js';
import type { SyncService } from '@/services/common/syncService.js';
import type { RecordsModelService } from '@/services/model/recordsModelService.js';

declare module '@fastify/awilix' {
  // App-lifetime singletons — resolved once, shared across every request.
  interface Cradle {
    db: BlinkDb;
    emailClient: EmailClient;
    authClient: AuthClient;
    openAiClient: OpenAiClient;
  }
  // Per-request services — awilix builds a fresh graph per `req.diScope`.
  interface RequestCradle {
    recordsModelService: RecordsModelService;
    authService: AuthService;
    syncService: SyncService;
    captureService: CaptureService;
  }
}

export type SingletonRegistrations = Required<NameAndRegistrationPair<Cradle>>;
export type RequestRegistrations = Required<NameAndRegistrationPair<RequestCradle>>;
