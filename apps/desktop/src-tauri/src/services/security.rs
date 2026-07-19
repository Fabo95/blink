//! Local Data-Loss-Prevention filter — step 3 of the capture data flow.
//!
//! Runs entirely on-device before a snippet is persisted or sent anywhere.
//! [`DEFAULT_RULES`] is a catalogue of provider-specific secret patterns (adapted
//! from the gitleaks ruleset) followed by generic catch-alls. Construct a
//! [`SecurityFilter`] with a custom rule set to extend the policy. DLP is heuristic:
//! the precise provider prefixes rarely misfire; the generic rules at the end trade
//! a little precision for coverage.

use regex::Regex;

use crate::core::models::SanitizeResult;

/// A declarative redaction rule, compiled into a matcher by [`SecurityFilter`].
pub struct RedactionRule {
    pub kind: &'static str,
    pub pattern: &'static str,
    pub replacement: &'static str,
}

/// The standard DLP catalogue. Ordered specific → generic: precise provider
/// prefixes run first and redact cleanly, so the broad catch-alls at the end only
/// see what the named rules missed (and can't double-count an already-redacted span).
pub const DEFAULT_RULES: &[RedactionRule] = &[
    // --- Private keys (PEM blocks) ---
    RedactionRule {
        kind: "private-key",
        pattern: r"(?s)-----BEGIN [A-Z ]*PRIVATE KEY-----.*?-----END [A-Z ]*PRIVATE KEY-----",
        replacement: "[REDACTED_PRIVATE_KEY]",
    },
    // --- Cloud providers ---
    RedactionRule {
        kind: "aws-access-key",
        pattern: r"\b(?:AKIA|ASIA|ABIA|ACCA|A3T[0-9A-Z])[0-9A-Z]{16}\b",
        replacement: "[REDACTED_AWS_KEY]",
    },
    RedactionRule {
        kind: "google-api-key",
        pattern: r"\bAIza[0-9A-Za-z\-_]{35}\b",
        replacement: "[REDACTED_GOOGLE_API_KEY]",
    },
    RedactionRule {
        kind: "google-oauth-secret",
        pattern: r"\bGOCSPX-[0-9A-Za-z\-_]{28,}\b",
        replacement: "[REDACTED_GOOGLE_OAUTH_SECRET]",
    },
    // --- Source hosts ---
    RedactionRule {
        kind: "github-token",
        pattern: r"\b(?:ghp|gho|ghu|ghs|ghr)_[0-9A-Za-z]{36}\b",
        replacement: "[REDACTED_GITHUB_TOKEN]",
    },
    RedactionRule {
        kind: "github-pat",
        pattern: r"\bgithub_pat_[0-9A-Za-z_]{82}\b",
        replacement: "[REDACTED_GITHUB_PAT]",
    },
    RedactionRule {
        kind: "gitlab-token",
        pattern: r"\bglpat-[0-9A-Za-z\-_]{20}\b",
        replacement: "[REDACTED_GITLAB_TOKEN]",
    },
    // --- SaaS ---
    RedactionRule {
        kind: "slack-token",
        pattern: r"\bxox[baprs]-[0-9A-Za-z-]{10,48}\b",
        replacement: "[REDACTED_SLACK_TOKEN]",
    },
    RedactionRule {
        kind: "slack-webhook",
        pattern: r"https://hooks\.slack\.com/services/[0-9A-Za-z/]+",
        replacement: "[REDACTED_SLACK_WEBHOOK]",
    },
    RedactionRule {
        kind: "stripe-key",
        pattern: r"\b(?:sk|rk)_(?:live|test)_[0-9A-Za-z]{10,99}\b",
        replacement: "[REDACTED_STRIPE_KEY]",
    },
    RedactionRule {
        kind: "openai-key",
        pattern: r"\bsk-(?:proj-)?[0-9A-Za-z\-_]{20,}\b",
        replacement: "[REDACTED_OPENAI_KEY]",
    },
    RedactionRule {
        kind: "npm-token",
        pattern: r"\bnpm_[0-9A-Za-z]{36}\b",
        replacement: "[REDACTED_NPM_TOKEN]",
    },
    RedactionRule {
        kind: "sendgrid-key",
        pattern: r"\bSG\.[0-9A-Za-z_\-]{22}\.[0-9A-Za-z_\-]{43}\b",
        replacement: "[REDACTED_SENDGRID_KEY]",
    },
    RedactionRule {
        kind: "twilio-key",
        pattern: r"\bSK[0-9a-fA-F]{32}\b",
        replacement: "[REDACTED_TWILIO_KEY]",
    },
    // --- Tokens / auth ---
    RedactionRule {
        kind: "jwt",
        pattern: r"\beyJ[0-9A-Za-z_\-]+\.eyJ[0-9A-Za-z_\-]+\.[0-9A-Za-z_\-]+",
        replacement: "[REDACTED_JWT]",
    },
    RedactionRule {
        kind: "bearer-token",
        pattern: r"\bBearer\s+[0-9A-Za-z\-._~+/]+=*",
        replacement: "Bearer [REDACTED_TOKEN]",
    },
    // Credentials embedded in a URL: scheme://user:pass@host — redact user:pass.
    RedactionRule {
        kind: "url-credentials",
        pattern: r"://[^\s:/@]+:[^\s@/]+@",
        replacement: "://[REDACTED]@",
    },
    // --- Generic catch-alls (least precise; run last) ---
    RedactionRule {
        kind: "api-key",
        pattern: r"(?i)\b(?:sk|pk|rk|api|key|token|secret)[-_](?:live|test|prod)?[-_]?[0-9A-Za-z]{16,}\b",
        replacement: "[REDACTED_API_KEY]",
    },
    // A keyword-gated `secret = "…"` / `token: …` assignment. Requires a sensitive
    // key name so ordinary `x = 12345678` never matches.
    RedactionRule {
        kind: "secret-assignment",
        pattern: r#"(?i)\b(?:api[_-]?key|secret|token|access[_-]?token|auth[_-]?token|client[_-]?secret|password|passwd|pwd)\s*[:=]\s*["']?[^\s"']{8,}["']?"#,
        replacement: "[REDACTED_SECRET]",
    },
    // Major card brands by prefix + length (Visa / Mastercard / Amex / Discover).
    RedactionRule {
        kind: "credit-card",
        pattern: r"\b(?:4[0-9]{12}(?:[0-9]{3})?|5[1-5][0-9]{14}|3[47][0-9]{13}|6(?:011|5[0-9]{2})[0-9]{12})\b",
        replacement: "[REDACTED_CARD]",
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
