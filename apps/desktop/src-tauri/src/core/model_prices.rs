//! Claude API list prices, for estimating what Claude Code usage would cost on the API. One
//! table, checked against Anthropic's published pricing (2026-10): update it here when prices
//! change. On a subscription the estimate is "what this would cost on the API", not a bill.

/// Dollars per million tokens.
#[derive(Debug, Clone, Copy, PartialEq)]
pub struct Rates {
    pub input: f64,
    pub output: f64,
    pub cache_read: f64,
}

impl Rates {
    /// Writing to the 5-minute cache costs 1.25× input; the 1-hour cache 2×.
    pub fn cache_write_5m(&self) -> f64 {
        self.input * 1.25
    }

    pub fn cache_write_1h(&self) -> f64 {
        self.input * 2.0
    }
}

/// Fast mode (Opus 5 / 5.5) bills every token at twice the standard rate.
pub const FAST_MULTIPLIER: f64 = 2.0;

const fn rates(input: f64, output: f64, cache_read: f64) -> Rates {
    Rates { input, output, cache_read }
}

/// Model id prefix → rates. Longer prefixes first: `claude-opus-5` must not swallow
/// `claude-opus-5-5`. A dated id (`claude-haiku-4-5-20251001`) matches its base id.
const PRICES: &[(&str, Rates)] = &[
    ("claude-fable-5-1", rates(10.0, 50.0, 0.25)),
    ("claude-mythos-5-1", rates(10.0, 50.0, 0.25)),
    ("claude-fable-5", rates(10.0, 50.0, 1.0)),
    ("claude-mythos-5", rates(10.0, 50.0, 1.0)),
    ("claude-opus-5-5", rates(4.0, 20.0, 0.20)),
    ("claude-opus-5", rates(5.0, 25.0, 0.50)),
    ("claude-opus-4-8", rates(5.0, 25.0, 0.50)),
    ("claude-opus-4-7", rates(5.0, 25.0, 0.50)),
    ("claude-opus-4-6", rates(5.0, 25.0, 0.50)),
    ("claude-sonnet-5", rates(2.0, 10.0, 0.20)),
    ("claude-sonnet-4-6", rates(3.0, 15.0, 0.30)),
    ("claude-haiku-4-5", rates(1.0, 5.0, 0.10)),
];

/// The rates for a model id, or `None` for a model the table doesn't know.
pub fn rates_for(model: &str) -> Option<Rates> {
    PRICES
        .iter()
        .find(|(prefix, _)| {
            model == *prefix
                || model
                    .strip_prefix(prefix)
                    .and_then(|rest| rest.strip_prefix('-'))
                    .is_some_and(|rest| rest.chars().all(|c| c.is_ascii_digit()))
        })
        .map(|(_, rates)| *rates)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn longest_prefix_and_dated_ids() {
        assert_eq!(rates_for("claude-opus-5-5").map(|r| r.input), Some(4.0));
        assert_eq!(rates_for("claude-opus-5").map(|r| r.input), Some(5.0));
        assert_eq!(rates_for("claude-haiku-4-5-20251001").map(|r| r.input), Some(1.0));
        assert_eq!(rates_for("claude-fable-5-1").map(|r| r.cache_read), Some(0.25));
        assert_eq!(rates_for("<synthetic>"), None);
        assert_eq!(rates_for("claude-opus-4-1"), None);
    }
}
