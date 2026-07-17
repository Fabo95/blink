import type { CaptureDraft } from '@blink/core/models/task';

export type TitleEngine = 'local-onnx' | 'cloud-proxy' | 'heuristic';

export interface TitleSuggestion {
  title: string;
  context: string;
  /** Which engine produced this, for audit trails. */
  engine: TitleEngine;
}

/**
 * Blink derives a task title + short context from a captured snippet. Engines are
 * interchangeable behind this interface — swapping one for another is a policy
 * decision (per IT config), never a code change at the call site.
 */
export interface TitleGenerator {
  suggest(draft: CaptureDraft): Promise<TitleSuggestion>;
}
