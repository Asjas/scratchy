import type { Redis } from "ioredis";

/** Default time-to-live in seconds for render contexts. */
const DEFAULT_CONTEXT_TTL = 60;

/** Default time-to-live in seconds for cached render results. */
const DEFAULT_RESULT_TTL = 300;

/** Maximum allowed TTL in seconds (roughly 1 year). */
const MAX_TTL = 365 * 24 * 60 * 60;

/**
 * Validates that a TTL value is a positive integer suitable for
 * the Redis `EX` option.
 * @throws {RangeError} if the value is not a positive integer or exceeds the maximum.
 */
function validateTtl(ttl: number): void {
  if (!Number.isInteger(ttl) || ttl <= 0 || ttl > MAX_TTL) {
    throw new RangeError(
      `TTL must be a positive integer no greater than ${MAX_TTL}, got ${ttl}`,
    );
  }
}

/**
 * Stores a render context in Redis so a worker thread can retrieve it
 * by request ID. Useful in distributed scenarios where workers cannot
 * receive the full context via the Piscina task payload.
 *
 * @param redis     — An ioredis client instance.
 * @param requestId — Unique identifier for the render request.
 * @param context   — The serializable render context object.
 * @param ttl       — Time-to-live in seconds (default: 60). Must be a positive integer.
 */
export async function storeRenderContext(
  redis: Redis,
  requestId: string,
  context: unknown,
  ttl: number = DEFAULT_CONTEXT_TTL,
): Promise<void> {
  validateTtl(ttl);
  await redis.set(
    `render:ctx:${requestId}`,
    JSON.stringify(context),
    "EX",
    ttl,
  );
}

/**
 * Retrieves a previously stored render context from Redis.
 *
 * @param redis     — An ioredis client instance.
 * @param requestId — The request ID used when storing the context.
 * @returns The parsed context object.
 * @throws if no context exists for the given request ID.
 */
export async function getRenderContext<T = unknown>(
  redis: Redis,
  requestId: string,
): Promise<T> {
  const raw = await redis.get(`render:ctx:${requestId}`);

  if (raw === null) {
    throw new Error(`No render context found for request ${requestId}`);
  }

  return JSON.parse(raw) as T;
}

/**
 * Stores a rendered HTML result in Redis for caching / retrieval
 * by the main thread.
 *
 * @param redis     — An ioredis client instance.
 * @param requestId — Unique identifier for the render request.
 * @param html      — The rendered HTML string.
 * @param ttl       — Time-to-live in seconds (default: 300). Must be a positive integer.
 */
export async function storeRenderResult(
  redis: Redis,
  requestId: string,
  html: string,
  ttl: number = DEFAULT_RESULT_TTL,
): Promise<void> {
  validateTtl(ttl);
  await redis.set(`render:result:${requestId}`, html, "EX", ttl);
}

/**
 * Removes the render context and result keys for a given request ID.
 *
 * @param redis     — An ioredis client instance.
 * @param requestId — The request ID to clean up.
 */
export async function cleanupRenderContext(
  redis: Redis,
  requestId: string,
): Promise<void> {
  await redis.del(`render:ctx:${requestId}`, `render:result:${requestId}`);
}
