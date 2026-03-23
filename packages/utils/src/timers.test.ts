import { interval } from "./timers.js";
import { describe, expect, it } from "vitest";

describe("interval", () => {
  it("yields values at the given interval until aborted", async () => {
    const controller = new AbortController();
    let count = 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of interval(20, { signal: controller.signal })) {
      count++;
      if (count >= 3) controller.abort();
    }

    expect(count).toBe(3);
  });

  it("stops immediately when the signal is already aborted", async () => {
    const controller = new AbortController();
    controller.abort();

    let count = 0;
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of interval(1, { signal: controller.signal })) {
      count++;
    }

    expect(count).toBe(0);
  });

  it("uses a default AbortSignal (never-aborted) when no signal is provided", async () => {
    let count = 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of interval(10)) {
      count++;
      if (count >= 2) break;
    }

    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("aborts iteration when signal is triggered mid-loop", async () => {
    const controller = new AbortController();
    let count = 0;

    try {
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      for await (const _ of interval(10, { signal: controller.signal })) {
        count++;
        if (count >= 1) {
          controller.abort();
        }
      }
    } catch {
      // Expected — abort triggers an error
    }

    expect(count).toBe(1);
  });

  it("handles options without signal (undefined signal)", async () => {
    let count = 0;

    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    for await (const _ of interval(10, {})) {
      count++;
      if (count >= 2) break;
    }

    expect(count).toBeGreaterThanOrEqual(2);
  });

  it("catches AbortError thrown by setTimeout when signal is aborted mid-wait", async () => {
    const controller = new AbortController();

    // Manually advance the generator so the 200ms timer starts running,
    // then abort during the wait — this puts the abort error into the catch block.
    const gen = interval(200, { signal: controller.signal });
    const tickPromise = gen.next();

    // Abort after a very short delay, well before the 200ms timer fires.
    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 10));
    controller.abort();

    // The generator should complete (done: true) because the catch block
    // detects signal.aborted === true and returns.
    const result = await tickPromise;
    expect(result.done).toBe(true);
  });

  it("catches and returns when an AbortError is thrown but signal is not yet marked aborted", async () => {
    const controller = new AbortController();

    // Build a fake signal that reports aborted=false even after the abort,
    // so that the second branch (error.name === "AbortError") is exercised.
    const fakeSignal = {
      aborted: false,
      addEventListener: controller.signal.addEventListener.bind(
        controller.signal,
      ),
      removeEventListener: controller.signal.removeEventListener.bind(
        controller.signal,
      ),
    } as unknown as AbortSignal;

    const gen = interval(200, { signal: fakeSignal });
    const tickPromise = gen.next();

    await new Promise<void>((resolve) => globalThis.setTimeout(resolve, 10));
    controller.abort();

    const result = await tickPromise;
    expect(result.done).toBe(true);
  });
});
