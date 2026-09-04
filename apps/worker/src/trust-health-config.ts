const INITIAL_RETRY_DELAY_MS = 30_000;
const MAX_RETRY_DELAY_MS = 3_600_000;
const RETRY_JITTER_RATIO = 0.25;

export const REMOTE_PROBE_POLICY = Object.freeze({
  maxConcurrentPerOrigin: 2,
  connectTimeoutMs: 1_000,
  totalTimeoutMs: 3_000,
  maxRedirects: 3,
  maxHeaderBytes: 2_048,
  maxResponseBytes: 8_192,
  maxDecompressedBytes: 8_192,
});

export interface PerOriginProbeLimiter {
  withKey<T>(key: string, task: () => Promise<T>): Promise<T>;
}

export function nextRemoteHealthRetryDelayMs(
  retriesConsumed: number,
  random: () => number,
): number {
  const boundedRetries = Number.isFinite(retriesConsumed)
    ? Math.max(0, Math.floor(retriesConsumed))
    : 0;
  const baseDelay = Math.min(INITIAL_RETRY_DELAY_MS * 2 ** boundedRetries, MAX_RETRY_DELAY_MS);
  const randomValue = Math.max(0, Math.min(1, random()));
  const jitter = Math.floor(baseDelay * RETRY_JITTER_RATIO * randomValue);
  return Math.min(baseDelay + jitter, MAX_RETRY_DELAY_MS);
}

export function createPerOriginProbeLimiter(maxConcurrentPerOrigin: number): PerOriginProbeLimiter {
  if (!Number.isInteger(maxConcurrentPerOrigin) || maxConcurrentPerOrigin < 1) {
    throw new RangeError("maxConcurrentPerOrigin must be a positive integer.");
  }

  const activeCounts = new Map<string, number>();
  const queues = new Map<string, Array<() => void>>();

  function scheduleNext(key: string): void {
    const queue = queues.get(key);
    if (!queue || queue.length === 0) {
      queues.delete(key);
      return;
    }
    const next = queue.shift();
    if (queue.length === 0) queues.delete(key);
    next?.();
  }

  return {
    async withKey<T>(key: string, task: () => Promise<T>): Promise<T> {
      if ((activeCounts.get(key) ?? 0) >= maxConcurrentPerOrigin) {
        await new Promise<void>((resolve) => {
          const queue = queues.get(key) ?? [];
          queue.push(resolve);
          queues.set(key, queue);
        });
      }

      activeCounts.set(key, (activeCounts.get(key) ?? 0) + 1);
      try {
        return await task();
      } finally {
        const remaining = (activeCounts.get(key) ?? 1) - 1;
        if (remaining === 0) activeCounts.delete(key);
        else activeCounts.set(key, remaining);
        scheduleNext(key);
      }
    },
  };
}
