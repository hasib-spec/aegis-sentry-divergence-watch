/**
 * AEGIS-SENTRY v4.0 — Token Bucket Rate Limiter
 *
 * In-memory sliding-window rate limiter for the public API.
 * Production deployment should use Redis or Vercel KV for
 * distributed rate limiting across serverless instances.
 *
 * Algorithm: Token Bucket (RFC 6749 §4.2.1 pattern)
 *   - Each IP gets a bucket of `capacity` tokens
 *   - Tokens refill at `refillRate` per second
 *   - Each request consumes 1 token
 *   - Burst allowed up to `burstCapacity`
 *
 * Reference:
 *   Thottan & Ji (2003), "Anomaly detection in IP networks"
 *   Vercel Edge Rate Limiting patterns (2024)
 */

interface TokenBucket {
  tokens: number;
  lastRefill: number;
}

interface RateLimiterConfig {
  /** Maximum sustained requests per window */
  capacity: number;
  /** Tokens added per second */
  refillRate: number;
  /** Maximum burst above capacity */
  burstCapacity: number;
  /** Window duration in ms for cleanup */
  windowMs: number;
}

const DEFAULT_CONFIG: RateLimiterConfig = {
  capacity: 100,       // 100 req/min sustained
  refillRate: 1.67,    // ~100/min = 1.67/s
  burstCapacity: 20,   // 20 req/s burst
  windowMs: 60_000,    // 1 minute window
};

const buckets = new Map<string, TokenBucket>();

// Periodic cleanup of stale buckets (every 5 min)
let cleanupTimer: ReturnType<typeof setInterval> | null = null;

function ensureCleanup() {
  if (cleanupTimer) return;
  cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, bucket] of buckets) {
      if (now - bucket.lastRefill > 300_000) {
        buckets.delete(key);
      }
    }
  }, 300_000);
  // Allow process to exit even if timer is active
  if (cleanupTimer && typeof cleanupTimer === "object" && "unref" in cleanupTimer) {
    (cleanupTimer as NodeJS.Timeout).unref();
  }
}

/**
 * Checks whether a request from the given key is allowed.
 *
 * @param key - Unique identifier (IP address, API key, etc.)
 * @param config - Rate limiter configuration
 * @returns { allowed, remaining, resetMs, limit }
 */
export function checkRateLimit(
  key: string,
  config: RateLimiterConfig = DEFAULT_CONFIG
): {
  allowed: boolean;
  remaining: number;
  resetMs: number;
  limit: number;
  retryAfterS: number;
} {
  ensureCleanup();

  const now = Date.now();
  let bucket = buckets.get(key);

  if (!bucket) {
    bucket = { tokens: config.capacity + config.burstCapacity, lastRefill: now };
    buckets.set(key, bucket);
  }

  // Refill tokens based on elapsed time
  const elapsed = (now - bucket.lastRefill) / 1000;
  const maxTokens = config.capacity + config.burstCapacity;
  bucket.tokens = Math.min(maxTokens, bucket.tokens + elapsed * config.refillRate);
  bucket.lastRefill = now;

  const allowed = bucket.tokens >= 1;

  if (allowed) {
    bucket.tokens -= 1;
  }

  const remaining = Math.max(0, Math.floor(bucket.tokens));
  const resetMs = allowed ? 0 : Math.ceil((1 - bucket.tokens) / config.refillRate * 1000);
  const retryAfterS = Math.ceil(resetMs / 1000);

  return {
    allowed,
    remaining,
    resetMs,
    limit: config.capacity,
    retryAfterS,
  };
}

/**
 * Extracts the client IP from a Next.js request.
 * Checks X-Forwarded-For (Vercel/proxy), X-Real-IP, and falls back.
 */
export function extractClientIP(headers: Headers): string {
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    // X-Forwarded-For: client, proxy1, proxy2
    return forwarded.split(",")[0].trim();
  }
  const realIp = headers.get("x-real-ip");
  if (realIp) return realIp.trim();
  return "unknown";
}

/**
 * Builds standard rate-limit response headers (RFC 6585 / IETF draft).
 */
export function rateLimitHeaders(result: ReturnType<typeof checkRateLimit>): Record<string, string> {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(Math.ceil(Date.now() / 1000) + result.retryAfterS),
    ...(result.allowed
      ? {}
      : {
          "Retry-After": String(result.retryAfterS),
        }),
  };
}

/**
 * Per-endpoint rate limit presets.
 */
export const RATE_PRESETS = {
  /** Public catalogue — generous */
  catalogue: { capacity: 100, refillRate: 1.67, burstCapacity: 20, windowMs: 60_000 },
  /** Single object dossier — moderate */
  dossier: { capacity: 60, refillRate: 1.0, burstCapacity: 10, windowMs: 60_000 },
  /** Computation-heavy (deflection, evolution) — stricter */
  compute: { capacity: 30, refillRate: 0.5, burstCapacity: 5, windowMs: 60_000 },
  /** Live observatory feed — tight */
  live: { capacity: 120, refillRate: 2.0, burstCapacity: 30, windowMs: 60_000 },
  /** Annotations / collaboration — moderate */
  collab: { capacity: 60, refillRate: 1.0, burstCapacity: 15, windowMs: 60_000 },
} as const;