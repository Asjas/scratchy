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
});
