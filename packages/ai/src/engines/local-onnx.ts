import type { CaptureDraft } from '@blink/core/models/task';
import type { TitleSuggestion } from '../title-generator.js';
import { BaseTitleGenerator } from './base.js';

/**
 * Local ONNX Runtime engine — the privacy-preserving path (Option A). No text
 * ever leaves the machine (Finance/Defense offline mode).
 *
 * TODO(phase-2): load a quantized instruct model via `onnxruntime-node` and run
 * inference in a Rust sidecar so no snippet text crosses into the JS heap. For
 * now it falls back to the heuristic so the seam is exercised offline.
 */
export class LocalOnnxTitleGenerator extends BaseTitleGenerator {
  async suggest(draft: CaptureDraft): Promise<TitleSuggestion> {
    return { ...this.heuristic(draft), engine: 'heuristic' };
  }
}
