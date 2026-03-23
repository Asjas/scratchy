# Benchmarks

> **Diátaxis type: [Reference](https://diataxis.fr/reference/)** —
> information-oriented, documents what the benchmarking suite measures and how
> to run it.

The Scratchy benchmarking suite measures the performance of the framework's most
critical hot paths using
[Vitest bench](https://vitest.dev/guide/features#benchmarking), which is powered
by [tinybench](https://github.com/tinylibs/tinybench).

All benchmarks live in the `benchmarks/` directory at the repository root and
are designed to be fast, deterministic, and free of I/O so that they can run on
any machine without external dependencies.

---

## Running Benchmarks

### Interactive mode (watch-friendly)

```bash
pnpm bench
```

Vitest runs all `.bench.ts` files and prints a live summary table. Re-runs
automatically when a source file changes.

### CI mode (single run)

```bash
pnpm bench:ci
```

Runs each benchmark once (no watch loop) and writes a machine-readable JSON
report to `benchmarks/results.json`. This file is excluded from version control
via `.gitignore` — it is intended for local comparison and CI artifact storage.

### Comparing runs

```bash
# Save a baseline first
pnpm bench:ci
cp benchmarks/results.json benchmarks/baseline.json

# After making changes, compare against the baseline
pnpm bench:ci -- --compare benchmarks/baseline.json
```

---

## Benchmark Suites

### `benchmarks/renderer/ring-buffer.bench.ts`

Measures the lock-free `SharedRingBuffer` used for streaming SSR chunk delivery
between the main thread and Worker Threads.

| Group                 | Benchmarks                                |
| --------------------- | ----------------------------------------- |
| Small payload (64 B)  | `write 64 bytes`, `write + read 64 bytes` |
| Medium payload (1 KB) | `write 1 KB`, `write + read 1 KB`         |
| Large payload (16 KB) | `write 16 KB`, `write + read 16 KB`       |
| Sequential throughput | 100 × write + read cycles (64 B each)     |
| Introspection         | `availableToRead`, `isEmpty`, `isFull`    |

**Key insight:** Ring-buffer introspection getters (`availableToRead`,
`isEmpty`, `isFull`) run at ~14 million ops/sec because they perform a single
`Atomics.load` per pointer.

### `benchmarks/renderer/shared-buffer.bench.ts`

Measures the `SharedBuffer` helpers — `createSharedBuffer`, `writeToBuffer`, and
`readFromBuffer` — used to pass structured JSON payloads between the main thread
and Worker Threads for non-streaming SSR.

| Group                       | Benchmarks                                              |
| --------------------------- | ------------------------------------------------------- |
| Allocation                  | `createSharedBuffer(4 KB)`, `createSharedBuffer(64 KB)` |
| Small payload (~100 B JSON) | write, write + read                                     |
| Medium payload (~2 KB JSON) | write, write + read                                     |
| Large payload (~10 KB JSON) | write, write + read                                     |

**Key insight:** `createSharedBuffer` performance drops sharply for larger
buffers because `SharedArrayBuffer` allocation involves an OS memory mapping
call. Reuse buffers across requests where possible.

### `benchmarks/utils/safe-redirect.bench.ts`

Measures `safeRedirect` — the open-redirect guard used whenever a redirect
destination comes from user-supplied input (e.g. a `redirectTo` query-string
parameter).

| Group                   | Benchmarks                                                                                              |
| ----------------------- | ------------------------------------------------------------------------------------------------------- |
| Valid paths             | `/`, `/dashboard`, `/settings/profile`, query string, hash                                              |
| Rejected inputs         | Absolute URLs, protocol-relative, backslash-relative, path traversal, `null`, `undefined`, empty string |
| Percent-encoded bypass  | `%2F%2F`, `%2e%2e`, mixed encoding                                                                      |
| Custom default redirect | Valid path, invalid input                                                                               |

**Key insight:** `null` / `undefined` / empty-string inputs are rejected in the
first guard (`typeof to !== "string"`) and run at ~16 million ops/sec. Inputs
that require `decodeURIComponent` are ~3.5× slower due to the decode overhead,
but still fast enough to use freely on every request.

### `benchmarks/utils/promise.bench.ts`

Measures the `promiseHash` and `timeout` promise utilities.

| Group                                 | Benchmarks                                                   |
| ------------------------------------- | ------------------------------------------------------------ |
| `promiseHash` — concurrent resolution | 2, 5, 10 already-resolved promises; 5 object-valued promises |
| `timeout` — wrapping fast promises    | 1 s budget, 5 s budget                                       |

**Key insight:** `promiseHash` overhead scales linearly with the number of
entries because it calls `Promise.all` over `Object.entries`. For
already-resolved promises the overhead is primarily the object-allocation cost.

### `benchmarks/utils/ip-address.bench.ts`

Measures `getClientIPAddress` — the header-priority-list IP extraction utility
that handles common proxy and CDN header patterns.

| Group                       | Benchmarks                                                           |
| --------------------------- | -------------------------------------------------------------------- |
| No IP headers               | Empty header object → `null`                                         |
| Single header               | `cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`, `true-client-ip` |
| `x-forwarded-for` multi-hop | 2-hop chain, 4-hop chain                                             |
| RFC 7239 `Forwarded` header | Simple `for=`, with port, IPv6 literal, multi-hop                    |
| IPv6 addresses              | `x-forwarded-for` with an IPv6 address                               |

**Key insight:** Simple `x-forwarded-for` runs at ~1.9 million ops/sec. RFC 7239
`Forwarded` header parsing is ~2× slower due to the regex-based directive
splitting, but still well within acceptable limits for per-request overhead.

---

## Output Columns

Vitest bench prints the following columns for each benchmark:

| Column    | Meaning                                                    |
| --------- | ---------------------------------------------------------- |
| `hz`      | Operations per second — higher is faster                   |
| `min`     | Fastest single sample (µs)                                 |
| `max`     | Slowest single sample (µs)                                 |
| `mean`    | Average time per operation (µs)                            |
| `p75`     | 75th-percentile latency (µs)                               |
| `p99`     | 99th-percentile latency (µs)                               |
| `p995`    | 99.5th-percentile latency (µs)                             |
| `p999`    | 99.9th-percentile latency (µs)                             |
| `rme`     | Relative margin of error — lower means more stable results |
| `samples` | Number of samples collected                                |

---

## Configuration

The benchmarking suite uses a dedicated Vitest config (`vitest.bench.config.ts`)
that is separate from the regular test config (`vitest.config.ts`). This keeps
benchmark files out of the normal `pnpm test` run.

```typescript
// vitest.bench.config.ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    include: ["benchmarks/**/*.bench.ts"],
    benchmark: {
      include: ["benchmarks/**/*.bench.ts"],
      outputJson: "benchmarks/results.json",
    },
  },
});
```

---

## Adding a New Benchmark

1. Create a file matching `benchmarks/<area>/<name>.bench.ts`.
2. Import the function under test directly from the package source:

   ```typescript
   import { myFunction } from "../../packages/my-package/src/my-module.js";
   import { bench, describe } from "vitest";

   describe("myFunction – happy path", () => {
     bench("typical input", () => {
       myFunction("typical input");
     });
   });
   ```

3. Group related benchmarks with `describe`.
4. Keep each benchmark **pure and synchronous** when possible. For async
   benchmarks, return the promise from the bench callback.
5. Avoid I/O, network calls, or spawning processes inside benchmarks.
6. Run `pnpm bench:ci` to verify the new suite passes.

---

## Related Documentation

- [Testing](./testing.md) — Unit, integration, and component test patterns
- [Worker Communication](./worker-communication.md) — SharedArrayBuffer and ring
  buffer architecture details
- [Rendering](./rendering.md) — Piscina worker pool and SSR pipeline
