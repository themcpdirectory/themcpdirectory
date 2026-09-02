import { getConnInfo } from "@hono/node-server/conninfo";
import type { Context, MiddlewareHandler } from "hono";
import type { ApiEnv, RateLimitBucket, RateLimiter, RateLimitKeyResolver } from "../app.js";
import { HttpApiError } from "./errors.js";

function firstForwardedFor(value: string | undefined): string | null {
  const candidate = value?.split(",")[0]?.trim();
  return candidate && candidate.length > 0 ? candidate : null;
}

export function resolveDevelopmentRateLimitKey(c: Context<ApiEnv>): string {
  return `dev:${firstForwardedFor(c.req.header("x-forwarded-for")) ?? c.req.header("x-real-ip") ?? "127.0.0.1"}`;
}

export function resolveProductionRateLimitKey(c: Context<ApiEnv>): string {
  return `ip:${getConnInfo(c).remote.address ?? "unknown"}`;
}

export function createInMemoryRateLimiter(config: {
  windowSeconds: number;
  maxReads: number;
  maxEntries?: number;
}): RateLimiter {
  if (!Number.isInteger(config.windowSeconds) || config.windowSeconds <= 0) {
    throw new RangeError("windowSeconds must be a positive integer");
  }
  if (!Number.isInteger(config.maxReads) || config.maxReads <= 0) {
    throw new RangeError("maxReads must be a positive integer");
  }
  const maxEntries = config.maxEntries ?? 10_000;
  if (!Number.isInteger(maxEntries) || maxEntries <= 0) {
    throw new RangeError("maxEntries must be a positive integer");
  }

  const buckets = new Map<string, { count: number; resetAt: number }>();

  return {
    async check(bucket, callerKey) {
      const key = `${bucket}:${callerKey}`;
      const now = Date.now();
      const current = buckets.get(key);

      if (!current || current.resetAt <= now) {
        if (!current && buckets.size >= maxEntries) {
          let earliestResetAt = Number.POSITIVE_INFINITY;
          for (const [existingKey, entry] of buckets) {
            if (entry.resetAt <= now) {
              buckets.delete(existingKey);
            } else {
              earliestResetAt = Math.min(earliestResetAt, entry.resetAt);
            }
          }
          if (buckets.size >= maxEntries) {
            return {
              allowed: false,
              retryAfterSeconds: Math.max(1, Math.ceil((earliestResetAt - now) / 1000)),
            };
          }
        }
        buckets.set(key, { count: 1, resetAt: now + config.windowSeconds * 1000 });
        return { allowed: true, retryAfterSeconds: null };
      }
      if (current.count >= config.maxReads) {
        return {
          allowed: false,
          retryAfterSeconds: Math.max(1, Math.ceil((current.resetAt - now) / 1000)),
        };
      }

      current.count += 1;
      return { allowed: true, retryAfterSeconds: null };
    },
  };
}

export function attachRateLimit(
  rateLimiter: RateLimiter,
  rateLimitKeyResolver: RateLimitKeyResolver,
  bucket: RateLimitBucket,
): MiddlewareHandler<ApiEnv> {
  return async (c, next) => {
    const callerKey = rateLimitKeyResolver(c);
    const result = await rateLimiter.check(bucket, callerKey);
    c.set("rateLimitKey", callerKey);
    c.set("rateLimitBucket", bucket);
    c.set("rateLimitAllowed", result.allowed);

    if (!result.allowed) {
      if (result.retryAfterSeconds !== null) {
        c.set("rateLimitRetryAfter", result.retryAfterSeconds);
      }
      throw new HttpApiError("RATE_LIMITED");
    }

    await next();
  };
}
