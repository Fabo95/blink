//! Local Data-Loss-Prevention filter — step 3 of the capture data flow.
//!
//! Runs entirely on-device before a snippet is ever persisted or sent anywhere.
//! Patterns are kept in parity with `packages/core/src/redaction.ts` so the JS
//! export gateway and the Rust capture path redact identically.

use once_cell::sync::Lazy;
use regex::Regex;

use crate::models::SanitizeResult;

struct Pattern {
    kind: &'static str,
    regex: Regex,
    replacement: &'static str,
}

static PATTERNS: Lazy<Vec<Pattern>> = Lazy::new(|| {
    vec![
        Pattern {
            kind: "private-key",
            regex: Regex::new(
                r"(?s)-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----.*?-----END (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----",
            )
            .expect("valid private-key regex"),
            replacement: "[REDACTED_PRIVATE_KEY]",
        },
        Pattern {
            kind: "aws-access-key",
            regex: Regex::new(r"\b(?:AKIA|ASIA)[0-9A-Z]{16}\b").expect("valid aws regex"),
            replacement: "[REDACTED_AWS_KEY]",
        },
        Pattern {
            kind: "bearer-token",
            regex: Regex::new(r"\bBearer\s+[A-Za-z0-9\-._~+/]+=*")
                .expect("valid bearer regex"),
            replacement: "Bearer [REDACTED_TOKEN]",
        },
        Pattern {
            kind: "api-key",
            regex: Regex::new(
                r"(?i)\b(?:sk|pk|rk|api|key|token|secret)[-_](?:live|test|prod)?[-_]?[A-Za-z0-9]{16,}\b",
            )
            .expect("valid api-key regex"),
            replacement: "[REDACTED_API_KEY]",
        },
        Pattern {
            kind: "password",
            regex: Regex::new(r"(?i)\b(?:password|passwd|pwd)\s*[:=]\s*\S+")
                .expect("valid password regex"),
            replacement: "password=[REDACTED]",
        },
    ]
});

pub fn sanitize(input: &str) -> SanitizeResult {
    let mut clean = input.to_string();
    let mut redaction_count = 0usize;
    let mut matched: Vec<String> = Vec::new();

    for pattern in PATTERNS.iter() {
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
