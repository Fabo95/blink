import type { RedactionKind, SanitizeResult } from '../models/index.js';
import { REDACTION_PATTERNS, type RedactionPattern } from './patterns.js';

/**
 * Reference JS implementation of the local Data-Loss-Prevention filter. The
 * authoritative capture-path filter lives in Rust; this keeps parity for any
 * client-side or export-time sanitization.
 *
 * Extend by passing a custom pattern set — e.g. an enterprise policy that adds
 * internal-hostname or ticket-ID redactions:
 *
 * ```ts
 * const filter = new SecurityFilter([...REDACTION_PATTERNS, myPattern]);
 * ```
 */
export class SecurityFilter {
  private readonly patterns: readonly RedactionPattern[];

  constructor(patterns: readonly RedactionPattern[] = REDACTION_PATTERNS) {
    this.patterns = patterns;
  }

  sanitize(input: string): SanitizeResult {
    let clean = input;
    let redactionCount = 0;
    const matched = new Set<RedactionKind>();

    for (const { kind, regex, replacement } of this.patterns) {
      clean = clean.replace(regex, () => {
        redactionCount += 1;
        matched.add(kind);
        return replacement;
      });
    }

    return { clean, redactionCount, matched: [...matched] };
  }
}

/** Shared default filter using the standard {@link REDACTION_PATTERNS}. */
export const securityFilter = new SecurityFilter();
