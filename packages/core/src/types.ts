/**
 * Canonical data model shared by every Blink layer (client, AI, crypto, sync).
 * Mirrors the Rust structs exposed by the Tauri core over the IPC boundary.
 */

export type TaskStatus = 'inbox' | 'active' | 'exported' | 'archived';

/** Where a captured snippet originated — the "system metadata" from the data flow. */
export interface CaptureSource {
  /** Bundle / application identifier the snippet was captured from, e.g. `com.tinyspeck.slackmacgap`. */
  appId: string;
  /** Foreground window title at capture time. */
  windowTitle: string;
  /** ISO-8601 timestamp of capture. */
  capturedAt: string;
}

/**
 * A raw snippet after the local security filter has run but before it becomes a
 * persisted task. This is the object surfaced in the capture review UI.
 */
export interface CaptureDraft {
  /** The sanitized text (secrets already redacted). */
  text: string;
  /** The original, unredacted length — never the content, only the count. */
  originalLength: number;
  /** Number of sensitive spans the DLP filter redacted. */
  redactionCount: number;
  source: CaptureSource;
}

/** Result of running the local Data-Loss-Prevention filter over a text. */
export interface SanitizeResult {
  clean: string;
  redactionCount: number;
  /** Which pattern kinds matched, for the "why was this redacted" affordance. */
  matched: RedactionKind[];
}

export type RedactionKind =
  | 'api-key'
  | 'password'
  | 'private-key'
  | 'bearer-token'
  | 'aws-access-key'
  | 'email'
  | 'ip-address';

export interface Task {
  id: string;
  title: string;
  body: string;
  status: TaskStatus;
  source: CaptureSource;
  createdAt: string;
  updatedAt: string;
}

/** Payload sent from the client to create a task. */
export interface NewTask {
  title: string;
  body: string;
  source: CaptureSource;
}
