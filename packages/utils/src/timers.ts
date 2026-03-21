import { setTimeout } from "node:timers/promises";

interface IntervalOptions {
  signal?: AbortSignal;
}

/**
 * An async generator that yields on a fixed interval until the optional
 * `AbortSignal` is aborted. Useful for SSE routes that need to push data on a
 * schedule.
 *
 * @param ms - Interval duration in milliseconds.
 * @param options - Optional `signal` to stop the interval.
 *
 * @example
 * const controller = new AbortController();
 * for await (const _ of interval(1000, { signal: controller.signal })) {
 *   reply.raw.write(`data: ${new Date().toISOString()}\n\n`);
 * }
 */
export async function* interval(
  ms: number,
  options?: IntervalOptions,
): AsyncGenerator<void> {
  while (true) {
    if (options?.signal?.aborted) return;
    try {
      yield await setTimeout(ms, void 0, { signal: options?.signal });
    } catch (error) {
      // Only treat abort-related errors as a signal to stop the interval.
      if (options?.signal?.aborted) {
        return;
      }
      if (
        error &&
        typeof error === "object" &&
        "name" in error &&
        (error as { name: unknown }).name === "AbortError"
      ) {
        return;
      }
      throw error;
    }
  }
}
