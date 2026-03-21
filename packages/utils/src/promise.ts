/**
 * Utility type for an object whose values are all Promises.
 */
export type PromiseHash = Record<string, Promise<unknown>>;

/**
 * Given an object where each value is a Promise, infer the resolved type for
 * each key.
 */
export type AwaitedPromiseHash<Hash> = Hash extends PromiseHash
  ? { [Key in keyof Hash]: Awaited<Hash[Key]> }
  : never;

/**
 * An object version of `Promise.all`. Pass an object whose values are
 * Promises and get back an object with the same keys containing the resolved
 * values.
 *
 * @example
 * const { user, posts } = await promiseHash({
 *   user: getUser(id),
 *   posts: getPosts(id),
 * });
 */
export async function promiseHash<Hash extends object>(
  hash: Hash,
): Promise<AwaitedPromiseHash<Hash>> {
  return Object.fromEntries(
    await Promise.all(
      Object.entries(hash).map(async ([key, promise]) => [key, await promise]),
    ),
  ) as AwaitedPromiseHash<Hash>;
}

/**
 * Unique sentinel used internally to detect when a timeout fires first.
 * @private
 */
const TIMEOUT_SENTINEL = Symbol("TIMEOUT");

/**
 * An error thrown when a `timeout()` call expires before the wrapped promise
 * resolves or rejects.
 */
export class TimeoutError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "TimeoutError";
  }
}

/**
 * Attach a timeout to any promise. If the timeout fires before the promise
 * settles, rejects with a `TimeoutError`. Optionally accepts an
 * `AbortController` whose signal will be aborted on timeout.
 *
 * @param promise - The promise to race against the timeout.
 * @param options.ms - Milliseconds before the timeout fires.
 * @param options.controller - Optional `AbortController` to abort on timeout.
 *
 * @example
 * try {
 *   const result = await timeout(fetch("https://example.com"), { ms: 100 });
 * } catch (error) {
 *   if (error instanceof TimeoutError) {
 *     // handle timeout
 *   }
 * }
 */
export async function timeout<Value>(
  promise: Promise<Value>,
  options: { controller?: AbortController; ms: number },
): Promise<Value> {
  let timer: ReturnType<typeof setTimeout> | null = null;

  try {
    const result = await Promise.race([
      promise,
      new Promise<typeof TIMEOUT_SENTINEL>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT_SENTINEL), options.ms);
      }),
    ]);

    if (timer !== null) clearTimeout(timer);

    if (result === TIMEOUT_SENTINEL) {
      if (options.controller) options.controller.abort();
      throw new TimeoutError(`Timed out after ${options.ms}ms`);
    }

    return result as Awaited<Value>;
  } catch (error) {
    if (timer !== null) clearTimeout(timer);
    throw error;
  }
}
