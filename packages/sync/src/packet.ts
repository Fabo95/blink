import type { Task } from '@blink/core';
import type { EncryptedEnvelope } from '@blink/crypto';
import type { HybridLogicalClock } from './clock.js';

/**
 * The unit pushed to / pulled from the cloud. Zero-knowledge: sensitive fields
 * are already {@link EncryptedEnvelope}s, so the transport and server see only
 * ciphertext. Non-sensitive metadata (status, clock) travels in clear.
 */
export interface SyncPacket {
  taskId: string;
  clock: HybridLogicalClock;
  status: Task['status'];
  encrypted: {
    title: EncryptedEnvelope;
    body: EncryptedEnvelope;
  };
}
