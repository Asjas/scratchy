/**
 * Tests the rethrow branch of `interval` — when `setTimeout` rejects with
 * a non-AbortError and the signal is not aborted, the error must propagate.
 *
 * Uses `vi.mock` (hoisted) to replace `node:timers/promises` so that
 * `setTimeout` throws a `TypeError` on the very first call.
 */
import { describe, expect, it, vi } from "vitest";

// Must be at the top level so Vitest hoists it before the interval import.
vi.mock("node:timers/promises", () => ({
  setTimeout: vi.fn().mockRejectedValueOnce(new TypeError("network error")),
}));

describe("interval — rethrows non-abort errors", () => {
  it("rethrows a non-AbortError from the mocked setTimeout", async () => {
    const { interval } = await import("./timers.js");

    const gen = interval(10);
    await expect(gen.next()).rejects.toThrow("network error");
  });
});
