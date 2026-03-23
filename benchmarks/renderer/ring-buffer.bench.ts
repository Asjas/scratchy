/**
 * Benchmarks for the lock-free SharedRingBuffer used in streaming SSR.
 *
 * Measures the throughput of write and read operations under three payload
 * sizes to surface the impact of ring-wrapping and memcpy overhead.
 */
import { SharedRingBuffer } from "../../packages/renderer/src/ring-buffer.js";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// Small payload — fits well within a single contiguous ring segment
// ---------------------------------------------------------------------------

describe("SharedRingBuffer – small payload (64 B)", () => {
  const CAPACITY = 4 * 1024; // 4 KB ring
  const payload = new Uint8Array(64).fill(0x61); // 64 bytes of 'a'

  bench("write 64 bytes", () => {
    const ring = new SharedRingBuffer(CAPACITY);
    ring.write(payload);
  });

  bench("write + read 64 bytes", () => {
    const ring = new SharedRingBuffer(CAPACITY);
    ring.write(payload);
    ring.read(64);
  });
});

// ---------------------------------------------------------------------------
// Medium payload — typical HTML chunk (~1 KB)
// ---------------------------------------------------------------------------

describe("SharedRingBuffer – medium payload (1 KB)", () => {
  const CAPACITY = 16 * 1024; // 16 KB ring
  const payload = new Uint8Array(1024).fill(0x62); // 1 KB of 'b'

  bench("write 1 KB", () => {
    const ring = new SharedRingBuffer(CAPACITY);
    ring.write(payload);
  });

  bench("write + read 1 KB", () => {
    const ring = new SharedRingBuffer(CAPACITY);
    ring.write(payload);
    ring.read(1024);
  });
});

// ---------------------------------------------------------------------------
// Large payload — full SSR page (~16 KB)
// ---------------------------------------------------------------------------

describe("SharedRingBuffer – large payload (16 KB)", () => {
  const CAPACITY = 64 * 1024; // 64 KB ring
  const payload = new Uint8Array(16 * 1024).fill(0x63); // 16 KB of 'c'

  bench("write 16 KB", () => {
    const ring = new SharedRingBuffer(CAPACITY);
    ring.write(payload);
  });

  bench("write + read 16 KB", () => {
    const ring = new SharedRingBuffer(CAPACITY);
    ring.write(payload);
    ring.read(16 * 1024);
  });
});

// ---------------------------------------------------------------------------
// Sequential throughput — write many small chunks into the same ring
// ---------------------------------------------------------------------------

describe("SharedRingBuffer – sequential throughput (100 × 64 B)", () => {
  const CAPACITY = 64 * 1024;
  const chunk = new Uint8Array(64).fill(0x64);

  bench("100 write + read cycles", () => {
    const ring = new SharedRingBuffer(CAPACITY);
    for (let i = 0; i < 100; i++) {
      ring.write(chunk);
      ring.read(64);
    }
  });
});

// ---------------------------------------------------------------------------
// Introspection helpers
// ---------------------------------------------------------------------------

describe("SharedRingBuffer – introspection", () => {
  const ring = new SharedRingBuffer(1024);
  const data = new Uint8Array(64).fill(0x65);
  ring.write(data);

  bench("availableToRead", () => {
    ring.availableToRead; // eslint-disable-line @typescript-eslint/no-unused-expressions
  });

  bench("isEmpty", () => {
    ring.isEmpty; // eslint-disable-line @typescript-eslint/no-unused-expressions
  });

  bench("isFull", () => {
    ring.isFull; // eslint-disable-line @typescript-eslint/no-unused-expressions
  });
});
