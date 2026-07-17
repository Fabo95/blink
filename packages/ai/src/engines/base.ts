import type { CaptureDraft } from '@blink/core/models/task';
import type { TitleGenerator, TitleSuggestion } from '../title-generator.js';

/**
 * Shared base for title engines. Provides the deterministic {@link heuristic}
 * fallback every engine leans on until a real model is wired, so new engines
 * only implement {@link suggest}.
 */
export abstract class BaseTitleGenerator implements TitleGenerator {
  abstract suggest(draft: CaptureDraft): Promise<TitleSuggestion>;

  /** Cheap, dependency-free title derivation. */
  protected heuristic(draft: CaptureDraft): Omit<TitleSuggestion, 'engine'> {
    const firstLine = draft.text.trim().split('\n', 1)[0] ?? '';
    const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8);
    const title = words.join(' ') || 'Captured snippet';
    return {
      title: title.length > 72 ? `${title.slice(0, 69)}…` : title,
      context: `From ${draft.source.appId} — ${draft.source.windowTitle}`,
    };
  }
}
