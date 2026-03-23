import { interval } from "./timers.js";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// node:timers/promises.setTimeout uses Node.js internal timers that
// vi.useFakeTimers() cannot intercept directly. This shim routes through
// globalThis.setTimeout (which IS replaceable by vi.useFakeTimers()) so that
// vi.advanceTimersByTimeAsync() can drive the interval generator in tests.
//
// vi.mock() is hoisted by Vitest, so the import inside timers.ts loads the
// mocked version from the very first test.
vi.mock("node:timers/promises", () => ({
  setTimeout: (
    ms: number,
    value: unknown,
    options?: { signal?: AbortSignal },
  ) =>
    new Promise<unknown>((resolve, reject) => {
      const id = globalThis.setTimeout(() => resolve(value), ms);
      options?.signal?.addEventListener(
        "abort",
        () => {
          globalThis.clearTimeout(id);
          reject(
            options.signal?.reason ??
              new DOMException("This operation was aborted", "AbortError"),
          );
        },
        { once: true },
      );
    }),
}));

describe("interval", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("yields values at the given interval until aborted", async () => {
    const controller = new AbortController();
    let count = 0;

    async function runLoop() {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of interval(1000, { signal: controller.signal })) {
        count++;
        if (count >= 3) controller.abort();
      }
    }

    const loopPromise = runLoop();
    await vi.advanceTimersByTimeAsync(3000);
    await loopPromise;

    expect(count).toBe(3);
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of interval(1000, { signal: controller.signal })) {
      count++;
    }

    expect(count).toBe(0);
  });

  it("uses a default AbortSignal (never-aborted) when no signal is provided", async () => {
    let count = 0;

    async function runLoop() {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of interval(1000)) {
        count++;
        if (count >= 2) break;
      }
    }

    const loopPromise = runLoop();
    await vi.advanceTimersByTimeAsync(2000);
    await loopPromise;

    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("aborts iteration when signal is triggered mid-loop", async () => {
    const controller = new AbortController();
    let count = 0;

    async function runLoop() {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of interval(1000, { signal: controller.signal })) {
        count++;
        if (count >= 1) {
          controller.abort();
        }
      }
    }

    const loopPromise = runLoop();
    await vi.advanceTimersByTimeAsync(1000);
    await loopPromise;

    expect(count).toBe(1);
  });

  it("handles options without signal (undefined signal)", async () => {
    let count = 0;

    async function runLoop() {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of interval(1000, {})) {
        count++;
        if (count >= 2) break;
      }
    }

    const loopPromise = runLoop();
    await vi.advanceTimersByTimeAsync(2000);
    await loopPromise;

    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("catches AbortError thrown by setTimeout when signal is aborted mid-wait", async () => {
    const controller = new AbortController();

    // Start the generator — the shim registers an abort listener on the signal
    // and a fake globalThis.setTimeout. Aborting fires the listener
    // synchronously, which cancels the fake timer and rejects the promise.
    const gen = interval(1000, { signal: controller.signal });
    const tickPromise = gen.next();

    controller.abort();

    const result = await tickPromise;
    expect(result.done).toBe(true);
  });

  it("catches and returns when an AbortError is thrown but signal is not yet marked aborted", async () => {
    const controller = new AbortController();

    // A fake signal that always reports aborted=false so the second catch
    // branch (error.name === "AbortError") is exercised instead of the first.
    const fakeSignal = {
      aborted: false,
      addEventListener: controller.signal.addEventListener.bind(
        controller.signal,
      ),
      removeEventListener: controller.signal.removeEventListener.bind(
        controller.signal,
      ),
    } as unknown as AbortSignal;

    const gen = interval(1000, { signal: fakeSignal });
    const tickPromise = gen.next();

    // Aborting fires the listener registered by the shim, rejecting with
    // AbortError. Since fakeSignal.aborted stays false, the second catch
    // branch handles it.
    controller.abort();

    const result = await tickPromise;
    expect(result.done).toBe(true);
  });
});
