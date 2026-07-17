import type { CaptureDraft } from '@blink/core';
import type { TitleSuggestion } from '../title-generator.js';
import { BaseTitleGenerator } from './base.js';

/**
 * Cloud proxy engine — Phase-1 default (Option B). An E2EE proxy to a hosted
 * model over the Enterprise VPN.
 *
 * TODO(phase-1): POST the (already DLP-sanitized) draft text to the endpoint and
 * map the response. Falls back to the heuristic when no endpoint is configured.
 */
export class CloudTitleGenerator extends BaseTitleGenerator {
  private readonly endpoint?: string;

  constructor(endpoint?: string) {
    super();
    this.endpoint = endpoint;
  }

  async suggest(draft: CaptureDraft): Promise<TitleSuggestion> {
    if (!this.endpoint) {
      return { ...this.heuristic(draft), engine: 'heuristic' };
    }
    // TODO(phase-1): call `this.endpoint` and map the model response.
    return { ...this.heuristic(draft), engine: 'cloud-proxy' };
  }
}
