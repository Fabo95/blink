import type { CaptureDraft } from '@blink/core';

/**
 * Blink derives a task title + short context from a captured snippet. The
 * architecture offers two interchangeable engines behind this one interface:
 *
 *   Option A — {@link LocalOnnxTitleGenerator}: an on-device ONNX / local-LLM
 *     model. No text ever leaves the machine (Finance/Defense offline mode).
 *   Option B — {@link CloudTitleGenerator}: an E2EE proxy to a hosted model
 *     over the Enterprise VPN. Faster iteration, used by the Phase-1 MVP.
 *
 * Swapping engines is a policy decision (per IT config), never a code change at
 * the call site.
 */
export interface TitleSuggestion {
  title: string;
  context: string;
  /** Which engine produced this, for audit trails. */
  engine: 'local-onnx' | 'cloud-proxy' | 'heuristic';
}

export interface TitleGenerator {
  suggest(draft: CaptureDraft): Promise<TitleSuggestion>;
}

/**
 * Local ONNX Runtime engine — the privacy-preserving path.
 *
 * TODO(phase-2): load a quantized instruct model via `onnxruntime-node` and run
 * inference in a Rust sidecar so no snippet text crosses into the JS heap. For
 * now this falls back to a deterministic heuristic so the seam is exercised and
 * the capture UI has a real suggestion to render offline.
 */
export class LocalOnnxTitleGenerator implements TitleGenerator {
  async suggest(draft: CaptureDraft): Promise<TitleSuggestion> {
    return { ...heuristicSuggest(draft), engine: 'heuristic' };
  }
}

/**
 * Cloud proxy engine — Phase-1 default.
 *
 * TODO(phase-1): call the Enterprise-VPN model proxy. Requests must already be
 * DLP-sanitized by the local security filter before reaching here.
 */
export class CloudTitleGenerator implements TitleGenerator {
  constructor(private readonly endpoint?: string) {}

  async suggest(draft: CaptureDraft): Promise<TitleSuggestion> {
    if (!this.endpoint) {
      return { ...heuristicSuggest(draft), engine: 'heuristic' };
    }
    // TODO(phase-1): POST draft.text to `${this.endpoint}` and map the response.
    return { ...heuristicSuggest(draft), engine: 'cloud-proxy' };
  }
}

/** Cheap, dependency-free title derivation used until a real model is wired. */
function heuristicSuggest(draft: CaptureDraft): Omit<TitleSuggestion, 'engine'> {
  const firstLine = draft.text.trim().split('\n', 1)[0] ?? '';
  const words = firstLine.split(/\s+/).filter(Boolean).slice(0, 8);
  const title = words.join(' ') || 'Captured snippet';
  return {
    title: title.length > 72 ? `${title.slice(0, 69)}…` : title,
    context: `From ${draft.source.appId} — ${draft.source.windowTitle}`,
  };
}
