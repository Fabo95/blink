/**
 * The shared data shapes every Blink layer agrees on (client, Rust core, backend).
 * Mirrors the Rust structs in `apps/desktop/src-tauri/src/models.rs`.
 */

export type TaskStatus = 'inbox' | 'active' | 'exported' | 'archived';

/** Where a captured snippet came from — the "system metadata". */
export interface CaptureSource {
  /** App the snippet was captured from, e.g. `com.tinyspeck.slackmacgap`. */
  appId: string;
  /** Foreground window title at capture time. */
  windowTitle: string;
  /** ISO-8601 timestamp of capture. */
  capturedAt: string;
}

/** A sanitized snippet awaiting review, before it becomes a saved task. */
export interface CaptureDraft {
  /** The cleaned text (secrets already redacted). */
  text: string;
  /** Original length — the count only, never the content. */
  originalLength: number;
  /** How many secrets the filter redacted. */
  redactionCount: number;
  source: CaptureSource;
}

export type RedactionKind =
  | 'api-key'
  | 'password'
  | 'private-key'
  | 'bearer-token'
  | 'aws-access-key'
  | 'email'
  | 'ip-address';

/** Result of running the local secret-scrubber over a text. */
export interface SanitizeResult {
  clean: string;
  redactionCount: number;
  matched: RedactionKind[];
}

export interface Task {
  id: string;
  title: string;
  body: string;
  status: TaskStatus;
  source: CaptureSource;
  createdAt: string;
  updatedAt: string;
}

/** Payload to create a task. */
export interface NewTask {
  title: string;
  body: string;
  source: CaptureSource;
}
