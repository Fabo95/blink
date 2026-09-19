import { createHash } from 'node:crypto';
import { env } from '@/env.js';
import { logger } from '@/setup/logger.js';

const BASE_URL = 'https://api.openai.com';

/** Per-attempt ceiling. Short on purpose: a capture waits on this, and a slow answer is
 * worth less than a fast fallback to the raw note. */
const ATTEMPT_TIMEOUT_MS = 8_000;
/** Total budget across retries, so the caller's worst case stays bounded and the
 * Shortcut on the other end never appears to hang. */
const TOTAL_BUDGET_MS = 15_000;
const MAX_ATTEMPTS = 3;
const BASE_BACKOFF_MS = 400;

/** Consecutive failures before the breaker opens, and how long it stays open. Without
 * it, a sustained OpenAI outage makes every single capture burn the full retry budget
 * before falling back — the fallback is fine, paying 15s for it repeatedly is not. */
const BREAKER_THRESHOLD = 5;
const BREAKER_COOLDOWN_MS = 60_000;

/** Transient by nature: rate limits, request timeouts, and the 5xx family. Everything
 * else (400 bad request, 401 bad key, 403) is a bug or a config error — retrying it
 * just spends latency to fail the same way. */
const RETRYABLE_STATUS = new Set([408, 409, 429, 500, 502, 503, 504]);

export interface ChatMessage {
  role: 'system' | 'user';
  content: string;
}

export interface ChatCompletionRequest {
  model: string;
  messages: ChatMessage[];
  /** Structured Outputs: with `strict: true` the model is constrained to the schema, so
   * the response content parses as that shape without defensive coercion. */
  response_format?: {
    type: 'json_schema';
    json_schema: { name: string; strict: true; schema: Record<string, unknown> };
  };
  /** Cost ceiling per call — a runaway completion can't bill unboundedly. */
  max_completion_tokens?: number;
  /** 0 for a parsing task: the same note should yield the same fields. */
  temperature?: number;
  /** Opaque per-user id for OpenAI's abuse tooling. Hashed, never the real user id. */
  user?: string;
  /** Opt out of retention where the account allows it — task text is the user's data. */
  store?: boolean;
}

interface Usage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

/**
 * Transport to the OpenAI API — the only thing here that talks to it. Thin on intent
 * (the service decides what to ask and what to do with a bad answer) but deliberately
 * not naive about the network: bounded retries on transient failures, a total budget,
 * a circuit breaker, and structured telemetry.
 *
 * It never throws a parsed result — callers treat any throw as "couldn't parse" and
 * fall back, so hardening here only ever changes *how often* the good path is taken.
 */
export class OpenAiClient {
  // Breaker state lives on the instance, which is a DI singleton — per-request scoping
  // would reset it every call and never trip.
  private consecutiveFailures = 0;
  private openUntil = 0;

  async chatCompletion(body: ChatCompletionRequest): Promise<string | null> {
    if (Date.now() < this.openUntil) {
      throw new Error('openai: circuit breaker open, skipping call');
    }

    const deadline = Date.now() + TOTAL_BUDGET_MS;
    const startedAt = Date.now();
    let lastError: Error | undefined;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
      try {
        const content = await this.attempt(body, deadline);
        this.onSuccess();
        logger.info(
          { model: body.model, attempt, ms: Date.now() - startedAt },
          'openai: completion ok',
        );
        return content;
      } catch (err) {
        lastError = err instanceof Error ? err : new Error(String(err));
        const retryAfterMs = retryDelay(lastError, attempt);
        const budgetLeft = deadline - Date.now();

        // Stop on a non-retryable error, the last attempt, or a wait we can't afford.
        if (
          retryAfterMs === null ||
          attempt === MAX_ATTEMPTS ||
          budgetLeft <= retryAfterMs
        ) {
          break;
        }

        logger.warn(
          { model: body.model, attempt, err: lastError.message, retryInMs: retryAfterMs },
          'openai: retrying',
        );
        await sleep(retryAfterMs);
      }
    }

    this.onFailure();
    throw lastError ?? new Error('openai: request failed');
  }

  private async attempt(body: ChatCompletionRequest, deadline: number): Promise<string | null> {
    // Never wait past the overall budget, even if the per-attempt ceiling is higher.
    const timeout = Math.min(ATTEMPT_TIMEOUT_MS, Math.max(0, deadline - Date.now()));

    const res = await fetch(`${BASE_URL}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${env.OPENAI_API_KEY}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(timeout),
    });

    if (!res.ok) {
      // The body can echo request content, so it's summarised rather than logged whole.
      const detail = (await res.text()).slice(0, 500);
      throw new HttpError(res.status, detail, res.headers.get('retry-after'));
    }

    const payload = (await res.json()) as {
      choices?: { message?: { content?: string | null } }[];
      usage?: Usage;
      id?: string;
    };

    // Token counts and the request id are what make a surprising bill or a support
    // ticket answerable later. The note itself is never logged — only its shape.
    logger.info(
      {
        requestId: payload.id,
        promptTokens: payload.usage?.prompt_tokens,
        completionTokens: payload.usage?.completion_tokens,
      },
      'openai: usage',
    );

    return payload.choices?.[0]?.message?.content ?? null;
  }

  private onSuccess() {
    this.consecutiveFailures = 0;
    this.openUntil = 0;
  }

  private onFailure() {
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= BREAKER_THRESHOLD) {
      this.openUntil = Date.now() + BREAKER_COOLDOWN_MS;
      this.consecutiveFailures = 0;
      logger.error({ cooldownMs: BREAKER_COOLDOWN_MS }, 'openai: circuit breaker opened');
    }
  }
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    detail: string,
    readonly retryAfter: string | null,
  ) {
    super(`openai ${status}: ${detail}`);
  }
}

/** How long to wait before retrying, or `null` when the error isn't worth retrying.
 * A 429's `Retry-After` wins over our own backoff — the server knows better than we do. */
function retryDelay(err: Error, attempt: number): number | null {
  if (err instanceof HttpError) {
    if (!RETRYABLE_STATUS.has(err.status)) return null;
    const retryAfter = Number(err.retryAfter);
    if (Number.isFinite(retryAfter) && retryAfter > 0) return retryAfter * 1000;
  } else if (!isTransientNetworkError(err)) {
    return null;
  }
  return backoff(attempt);
}

/** `fetch` rejects with TimeoutError/AbortError from our own AbortSignal, and with a
 * TypeError on DNS/TLS/socket failures. Anything else is a bug on our side, not the
 * network's, and retrying it would just fail the same way. */
function isTransientNetworkError(err: Error): boolean {
  return err.name === 'TimeoutError' || err.name === 'AbortError' || err instanceof TypeError;
}

/** Exponential with full jitter (random in [0, ceiling]), so concurrent captures don't
 * retry in lockstep and re-create the spike that rate-limited them. */
function backoff(attempt: number): number {
  return Math.round(Math.random() * BASE_BACKOFF_MS * 2 ** (attempt - 1));
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/** Stable, non-reversible per-user id for OpenAI's abuse tooling — lets them rate-limit
 * a misbehaving account without us handing over a real user identifier. */
export function opaqueUserId(userId: string): string {
  return createHash('sha256').update(userId).digest('hex').slice(0, 32);
}
