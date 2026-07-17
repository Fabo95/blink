import type { RedactionKind } from '../models/index.js';

export interface RedactionPattern {
  kind: RedactionKind;
  regex: RegExp;
  /** Placeholder substituted for a match. */
  replacement: string;
}

/**
 * The DLP pattern catalogue. Kept in `@blink/core` so the TypeScript client, the
 * export gateway, and any future JS tooling redact identically to the Rust core.
 * The Rust `security_filter` module mirrors these patterns for the capture path.
 */
export const REDACTION_PATTERNS: readonly RedactionPattern[] = [
  {
    kind: 'private-key',
    regex:
      /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/g,
    replacement: '[REDACTED_PRIVATE_KEY]',
  },
  {
    kind: 'aws-access-key',
    regex: /\b(?:AKIA|ASIA)[0-9A-Z]{16}\b/g,
    replacement: '[REDACTED_AWS_KEY]',
  },
  {
    kind: 'bearer-token',
    regex: /\bBearer\s+[A-Za-z0-9\-._~+/]+=*/g,
    replacement: 'Bearer [REDACTED_TOKEN]',
  },
  {
    kind: 'api-key',
    regex: /\b(?:sk|pk|rk|api|key|token|secret)[-_](?:live|test|prod)?[-_]?[A-Za-z0-9]{16,}\b/gi,
    replacement: '[REDACTED_API_KEY]',
  },
  {
    kind: 'password',
    regex: /\b(?:password|passwd|pwd)\s*[:=]\s*\S+/gi,
    replacement: 'password=[REDACTED]',
  },
];
