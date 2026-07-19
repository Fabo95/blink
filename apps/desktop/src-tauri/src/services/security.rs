//! Local Data-Loss-Prevention filter — step 3 of the capture data flow.
//!
//! Runs entirely on-device before a snippet is persisted or sent anywhere. The
//! default rules stay in parity with `packages/core/src/redaction/patterns.ts`.
//! Construct a [`SecurityFilter`] with a custom rule set to extend the policy.

use regex::Regex;

use crate::core::models::SanitizeResult;

/// A declarative redaction rule, compiled into a matcher by [`SecurityFilter`].
pub struct RedactionRule {
    pub kind: &'static str,
    pub pattern: &'static str,
    pub replacement: &'static str,
}

/// The standard DLP catalogue, mirrored from `@blink/core`.
pub const DEFAULT_RULES: &[RedactionRule] = &[
    RedactionRule {
        kind: "private-key",
        pattern: r"(?s)-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
        replacement: "[REDACTED_PRIVATE_KEY]",
    },
    RedactionRule {
        kind: "aws-access-key",
        pattern: r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b",
        replacement: "[REDACTED_AWS_KEY]",
    },
    RedactionRule {
        kind: "bearer-token",
        pattern: r"\bBearer\s+[A-Za-z0-9\-._~+/]+=*",
        replacement: "Bearer [REDACTED_TOKEN]",
    },
    RedactionRule {
        kind: "api-key",
        pattern: r"(?i)\b(?:sk|pk|rk|api|key|token|secret)[-_](?:live|test|prod)?[-_]?[A-Za-z0-9]{16,}\b",
        replacement: "[REDACTED_API_KEY]",
    },
    RedactionRule {
        kind: "password",
        pattern: r"(?i)\b(?:password|passwd|pwd)\s*[:=]\s*\S+",
        replacement: "password=[REDACTED]",
    },
];

struct Compiled {
    kind: &'static str,
    regex: Regex,
    replacement: &'static str,
}

/// Redacts sensitive spans from text. Compile once (rules are compiled up front),
/// then share and reuse.
pub struct SecurityFilter {
    patterns: Vec<Compiled>,
}

impl SecurityFilter {
    /// Build a filter from an explicit rule set — the extension point for
    /// enterprise policies that add their own patterns.
    pub fn new(rules: &[RedactionRule]) -> Self {
        let patterns = rules
            .iter()
            .map(|rule| Compiled {
                kind: rule.kind,
                regex: Regex::new(rule.pattern).expect("valid redaction regex"),
                replacement: rule.replacement,
            })
            .collect();
        Self { patterns }
    }

    /// A filter using the standard [`DEFAULT_RULES`].
    pub fn with_defaults() -> Self {
        Self::new(DEFAULT_RULES)
    }

    pub fn sanitize(&self, input: &str) -> SanitizeResult {
        let mut clean = input.to_string();
        let mut redaction_count = 0usize;
        let mut matched: Vec<String> = Vec::new();

        for pattern in &self.patterns {
            let hits = pattern.regex.find_iter(&clean).count();
            if hits > 0 {
                redaction_count += hits;
                matched.push(pattern.kind.to_string());
                clean = pattern
                    .regex
                    .replace_all(&clean, pattern.replacement)
                    .into_owned();
            }
        }

        SanitizeResult {
            clean,
            redaction_count,
            matched,
        }
    }
}
