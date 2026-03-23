/**
 * Benchmarks for the promise utilities exported from @scratchyjs/utils.
 *
 * Measures the overhead of:
 * - `promiseHash` — concurrent resolution of multiple named promises
 * - `timeout` — wrapping a promise with a deadline
 */
import { promiseHash, timeout } from "../../packages/utils/src/promise.js";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// promiseHash
// ---------------------------------------------------------------------------

describe("promiseHash – concurrent resolution", () => {
  bench("2 already-resolved promises", async () => {
    await promiseHash({
      a: Promise.resolve(1),
      b: Promise.resolve(2),
    });
  });

  bench("5 already-resolved promises", async () => {
    await promiseHash({
      a: Promise.resolve(1),
      b: Promise.resolve(2),
      c: Promise.resolve(3),
      d: Promise.resolve(4),
      e: Promise.resolve(5),
    });
  });

  bench("10 already-resolved promises", async () => {
    await promiseHash({
      a: Promise.resolve(1),
      b: Promise.resolve(2),
      c: Promise.resolve(3),
      d: Promise.resolve(4),
      e: Promise.resolve(5),
      f: Promise.resolve(6),
      g: Promise.resolve(7),
      h: Promise.resolve(8),
      i: Promise.resolve(9),
      j: Promise.resolve(10),
    });
  });

  bench("5 promises with object values", async () => {
    await promiseHash({
      user: Promise.resolve({ id: "01HX5T", name: "Alice" }),
      posts: Promise.resolve([{ id: "p1", title: "Hello" }]),
      settings: Promise.resolve({ theme: "dark" }),
      notifications: Promise.resolve([]),
      session: Promise.resolve({ token: "abc123", expiresAt: new Date() }),
    });
  });
});

// ---------------------------------------------------------------------------
// timeout
// ---------------------------------------------------------------------------

describe("timeout – wrapping fast promises", () => {
  bench(
    "timeout wrapping an already-resolved promise (1 s budget)",
    async () => {
      await timeout(Promise.resolve(42), { ms: 1_000 });
    },
  );

  bench(
    "timeout wrapping an already-resolved object (5 s budget)",
    async () => {
      await timeout(Promise.resolve({ status: "ok" }), { ms: 5_000 });
    },
  );
});
