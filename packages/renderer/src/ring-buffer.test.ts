import { SharedRingBuffer } from "./ring-buffer.js";
import { describe, expect, it } from "vitest";

/** Asserts that `value` is not null and returns it with narrowed type. */
function assertNotNull<T>(value: T | null, label = "value"): T {
  if (value === null) throw new Error(`Expected ${label} to be non-null`);
  return value;
}

// ---------------------------------------------------------------------------
// Constructor
// ---------------------------------------------------------------------------

describe("SharedRingBuffer constructor", () => {
  it("allocates a SharedArrayBuffer of size HEADER_SIZE + capacity", () => {
    const ring = new SharedRingBuffer(1024);

    expect(ring.getSharedBuffer()).toBeInstanceOf(SharedArrayBuffer);
    // 8 bytes header (writePos + readPos) + 1024 bytes data
    expect(ring.byteLength).toBe(8 + 1024);
  });

  it("exposes the correct capacity", () => {
    const ring = new SharedRingBuffer(512);
    expect(ring.capacity).toBe(512);
  });

  it("initialises both pointers to 0 (empty on creation)", () => {
    const ring = new SharedRingBuffer(256);
    const sab = ring.getSharedBuffer();
    const writePos = new Int32Array(sab, 0, 1);
    const readPos = new Int32Array(sab, 4, 1);

    expect(Atomics.load(writePos, 0)).toBe(0);
    expect(Atomics.load(readPos, 0)).toBe(0);
  });

  it("throws RangeError for capacity 0", () => {
    expect(() => new SharedRingBuffer(0)).toThrow(RangeError);
    expect(() => new SharedRingBuffer(0)).toThrow(/positive integer/);
  });

  it("throws RangeError for negative capacity", () => {
    expect(() => new SharedRingBuffer(-1)).toThrow(RangeError);
  });

  it("throws RangeError for non-integer capacity", () => {
    expect(() => new SharedRingBuffer(1.5)).toThrow(RangeError);
    expect(() => new SharedRingBuffer(NaN)).toThrow(RangeError);
    expect(() => new SharedRingBuffer(Infinity)).toThrow(RangeError);
  });

  it("reports isEmpty = true and isFull = false on a fresh buffer", () => {
    const ring = new SharedRingBuffer(64);
    expect(ring.isEmpty).toBe(true);
    expect(ring.isFull).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// fromSharedBuffer
// ---------------------------------------------------------------------------

describe("SharedRingBuffer.fromSharedBuffer", () => {
  it("reconstructs a ring buffer from an existing SharedArrayBuffer", () => {
    const original = new SharedRingBuffer(256);
    const sab = original.getSharedBuffer();

    const reconstructed = SharedRingBuffer.fromSharedBuffer(sab);

    expect(reconstructed.capacity).toBe(256);
    expect(reconstructed.byteLength).toBe(original.byteLength);
    expect(reconstructed.getSharedBuffer()).toBe(sab);
  });

  it("shares the same underlying memory — writes by one are visible to the other", () => {
    const original = new SharedRingBuffer(1024);
    const reconstructed = SharedRingBuffer.fromSharedBuffer(
      original.getSharedBuffer(),
    );

    const data = new TextEncoder().encode("hello from producer");
    original.write(data);

    const result = reconstructed.read(data.byteLength);
    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(assertNotNull(result, "result"))).toBe(
      "hello from producer",
    );
  });

  it("throws RangeError when the SharedArrayBuffer is too small", () => {
    // A SAB of exactly 8 bytes → capacity = 0, which is invalid.
    const tinyBuffer = new SharedArrayBuffer(8);
    expect(() => SharedRingBuffer.fromSharedBuffer(tinyBuffer)).toThrow(
      RangeError,
    );
    expect(() => SharedRingBuffer.fromSharedBuffer(tinyBuffer)).toThrow(
      /too small/,
    );
  });

  it("throws RangeError when the SharedArrayBuffer has 0 bytes", () => {
    const empty = new SharedArrayBuffer(0);
    expect(() => SharedRingBuffer.fromSharedBuffer(empty)).toThrow(RangeError);
  });
});

// ---------------------------------------------------------------------------
// write()
// ---------------------------------------------------------------------------

describe("SharedRingBuffer write()", () => {
  it("returns true on a successful write", () => {
    const ring = new SharedRingBuffer(1024);
    const chunk = new TextEncoder().encode("hello");
    expect(ring.write(chunk)).toBe(true);
  });

  it("returns false when the ring is full", () => {
    const ring = new SharedRingBuffer(8);
    const full = new Uint8Array(8).fill(0xab);

    expect(ring.write(full)).toBe(true); // fills the buffer
    expect(ring.isFull).toBe(true);

    const extra = new Uint8Array(1).fill(0xff);
    expect(ring.write(extra)).toBe(false); // no space
  });

  it("returns false when chunk is larger than available space", () => {
    const ring = new SharedRingBuffer(8);
    const chunk = new Uint8Array(9).fill(0x01); // 9 bytes > 8 capacity
    expect(ring.write(chunk)).toBe(false);
  });

  it("returns true and is a no-op for a zero-length chunk", () => {
    const ring = new SharedRingBuffer(64);
    expect(ring.write(new Uint8Array(0))).toBe(true);
    // Nothing was written, so buffer should still be empty.
    expect(ring.isEmpty).toBe(true);
  });

  it("advances writePos by the chunk length", () => {
    const ring = new SharedRingBuffer(1024);
    const sab = ring.getSharedBuffer();
    const writePos = new Int32Array(sab, 0, 1);

    ring.write(new Uint8Array(10));
    expect(Atomics.load(writePos, 0)).toBe(10);

    ring.write(new Uint8Array(5));
    expect(Atomics.load(writePos, 0)).toBe(15);
  });

  it("does not advance writePos when the write fails (buffer full)", () => {
    const ring = new SharedRingBuffer(4);
    const sab = ring.getSharedBuffer();
    const writePos = new Int32Array(sab, 0, 1);

    ring.write(new Uint8Array(4)); // fills buffer
    expect(Atomics.load(writePos, 0)).toBe(4);

    ring.write(new Uint8Array(1)); // should fail
    expect(Atomics.load(writePos, 0)).toBe(4); // unchanged
  });
});

// ---------------------------------------------------------------------------
// read()
// ---------------------------------------------------------------------------

describe("SharedRingBuffer read()", () => {
  it("returns null when the buffer is empty", () => {
    const ring = new SharedRingBuffer(64);
    expect(ring.read(64)).toBeNull();
  });

  it("throws RangeError for maxBytes = 0", () => {
    const ring = new SharedRingBuffer(64);
    expect(() => ring.read(0)).toThrow(RangeError);
    expect(() => ring.read(0)).toThrow(/positive integer/);
  });

  it("throws RangeError for negative maxBytes", () => {
    const ring = new SharedRingBuffer(64);
    expect(() => ring.read(-1)).toThrow(RangeError);
  });

  it("throws RangeError for non-integer maxBytes", () => {
    const ring = new SharedRingBuffer(64);
    expect(() => ring.read(1.5)).toThrow(RangeError);
  });

  it("returns the written bytes in the correct order", () => {
    const ring = new SharedRingBuffer(1024);
    const encoded = new TextEncoder().encode("hello world");

    ring.write(encoded);
    const result = ring.read(encoded.byteLength);

    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(assertNotNull(result, "result"))).toBe(
      "hello world",
    );
  });

  it("returns at most maxBytes bytes even when more are available", () => {
    const ring = new SharedRingBuffer(1024);
    ring.write(new Uint8Array([1, 2, 3, 4, 5]));

    const result = ring.read(3);
    expect(result).not.toBeNull();
    const r = assertNotNull(result, "result");
    expect(r.byteLength).toBe(3);
    expect(Array.from(r)).toEqual([1, 2, 3]);
  });

  it("advances readPos by the number of bytes read", () => {
    const ring = new SharedRingBuffer(1024);
    const sab = ring.getSharedBuffer();
    const readPos = new Int32Array(sab, 4, 1);

    ring.write(new Uint8Array(10));
    ring.read(7);
    expect(Atomics.load(readPos, 0)).toBe(7);

    ring.read(3);
    expect(Atomics.load(readPos, 0)).toBe(10);
  });

  it("returns a copy of the data (not a view into the shared buffer)", () => {
    const ring = new SharedRingBuffer(64);
    const data = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    ring.write(data);

    const result = assertNotNull(ring.read(4), "result");
    // Mutate the result — the next read must not see the mutation.
    result[0] = 0x00;

    // Write and read a second message to confirm the ring data is intact.
    ring.write(new Uint8Array([0x01]));
    const second = assertNotNull(ring.read(1), "second");
    expect(second[0]).toBe(0x01);
  });
});

// ---------------------------------------------------------------------------
// Round-trip (write → read)
// ---------------------------------------------------------------------------

describe("SharedRingBuffer write/read round-trip", () => {
  it("preserves arbitrary binary data", () => {
    const ring = new SharedRingBuffer(4096);
    const original = new Uint8Array(100).map((_, i) => i % 256);

    ring.write(original);
    const result = ring.read(100);

    expect(result).not.toBeNull();
    expect(Array.from(assertNotNull(result, "result"))).toEqual(
      Array.from(original),
    );
  });

  it("preserves a UTF-8 encoded string", () => {
    const ring = new SharedRingBuffer(1024);
    const text = "こんにちは世界"; // non-ASCII to exercise multi-byte UTF-8
    const encoded = new TextEncoder().encode(text);

    ring.write(encoded);
    const result = ring.read(encoded.byteLength);

    expect(result).not.toBeNull();
    expect(new TextDecoder().decode(assertNotNull(result, "result"))).toBe(
      text,
    );
  });

  it("supports multiple sequential write/read cycles on the same buffer", () => {
    const ring = new SharedRingBuffer(256);

    for (let i = 0; i < 10; i++) {
      const msg = `message-${i}`;
      const encoded = new TextEncoder().encode(msg);
      expect(ring.write(encoded)).toBe(true);
      const result = ring.read(encoded.byteLength);
      expect(result).not.toBeNull();
      expect(new TextDecoder().decode(assertNotNull(result, "result"))).toBe(
        msg,
      );
    }
  });

  it("allows filling, draining, and re-filling the buffer", () => {
    const ring = new SharedRingBuffer(16);

    // Fill exactly
    const a = new Uint8Array(16).fill(0xaa);
    expect(ring.write(a)).toBe(true);
    expect(ring.isFull).toBe(true);

    // Drain
    const r1 = ring.read(16);
    expect(r1).not.toBeNull();
    expect(ring.isEmpty).toBe(true);

    // Refill with different data
    const b = new Uint8Array(16).fill(0xbb);
    expect(ring.write(b)).toBe(true);
    const r2 = ring.read(16);
    expect(r2).not.toBeNull();
    expect(assertNotNull(r2, "r2").every((v) => v === 0xbb)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Ring-wrap (split writes / reads across the boundary)
// ---------------------------------------------------------------------------

describe("SharedRingBuffer ring-wrap behaviour", () => {
  it("handles a write that wraps around the end of the data region", () => {
    // capacity=8, write 6 bytes → advances to offset 6
    // read 4 bytes → frees positions 0-3, readPos=4
    // write 5 bytes → 2 at positions [6,7], 3 at positions [0,1,2]
    const ring = new SharedRingBuffer(8);

    ring.write(new Uint8Array([10, 20, 30, 40, 50, 60])); // writePos=6
    ring.read(4); // readPos=4

    const wrapped = new Uint8Array([1, 2, 3, 4, 5]);
    expect(ring.write(wrapped)).toBe(true); // writePos=11

    const result = assertNotNull(ring.read(7), "result"); // 7 bytes available: [50,60,1,2,3,4,5]
    expect(Array.from(result)).toEqual([50, 60, 1, 2, 3, 4, 5]);
  });

  it("handles a read that wraps around the end of the data region", () => {
    // capacity=8
    // write 8 bytes to fill buffer
    // read 6 bytes — leaves 2 unread at positions [6,7]
    // write 4 more bytes — wraps into [0..3]
    // read 6 bytes — must reassemble [6,7] + [0,1,2,3]
    const ring = new SharedRingBuffer(8);

    ring.write(new Uint8Array([0, 1, 2, 3, 4, 5, 6, 7]));
    ring.read(6); // consume [0..5], readPos=6

    ring.write(new Uint8Array([8, 9, 10, 11])); // writePos=12, placed at [0..3]

    const result = assertNotNull(ring.read(6), "result"); // must reassemble [6,7,8,9,10,11]
    expect(Array.from(result)).toEqual([6, 7, 8, 9, 10, 11]);
  });

  it("handles many wrap-around cycles without data corruption", () => {
    const CAPACITY = 16;
    const ring = new SharedRingBuffer(CAPACITY);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const messages = [
      "short",
      "a bit longer msg",
      "x".repeat(10),
      "wrap!",
      "done",
    ];

    for (const msg of messages) {
      const encoded = encoder.encode(msg);

      // Ensure there is space (drain if needed)
      if (ring.availableToWrite < encoded.byteLength) {
        ring.read(ring.availableToRead);
      }

      expect(ring.write(encoded)).toBe(true);
      const result = ring.read(encoded.byteLength);
      expect(result).not.toBeNull();
      expect(decoder.decode(assertNotNull(result, "result"))).toBe(msg);
    }
  });

  it("read returns exactly capacity bytes when the full ring wraps", () => {
    // capacity=4; fill, drain 2, write 2 (wraps), read all 4
    const ring = new SharedRingBuffer(4);

    ring.write(new Uint8Array([0xa, 0xb, 0xc, 0xd])); // writePos=4
    ring.read(2); // readPos=2

    ring.write(new Uint8Array([0xe, 0xf])); // writePos=6, placed at [0,1]

    // Now ring contains [0xc,0xd] at positions [2,3] and [0xe,0xf] at [0,1]
    const result = assertNotNull(ring.read(4), "result");
    expect(Array.from(result)).toEqual([0xc, 0xd, 0xe, 0xf]);
  });
});

// ---------------------------------------------------------------------------
// Introspection helpers
// ---------------------------------------------------------------------------

describe("SharedRingBuffer introspection getters", () => {
  it("availableToRead returns 0 when buffer is empty", () => {
    const ring = new SharedRingBuffer(64);
    expect(ring.availableToRead).toBe(0);
  });

  it("availableToRead returns the number of written bytes", () => {
    const ring = new SharedRingBuffer(64);
    ring.write(new Uint8Array(20));
    expect(ring.availableToRead).toBe(20);
  });

  it("availableToWrite returns capacity when buffer is empty", () => {
    const ring = new SharedRingBuffer(64);
    expect(ring.availableToWrite).toBe(64);
  });

  it("availableToWrite decreases by the number of written bytes", () => {
    const ring = new SharedRingBuffer(64);
    ring.write(new Uint8Array(15));
    expect(ring.availableToWrite).toBe(49);
  });

  it("availableToRead + availableToWrite always equals capacity", () => {
    const ring = new SharedRingBuffer(100);
    ring.write(new Uint8Array(37));
    expect(ring.availableToRead + ring.availableToWrite).toBe(100);
  });

  it("isEmpty is true for a fresh buffer", () => {
    expect(new SharedRingBuffer(64).isEmpty).toBe(true);
  });

  it("isEmpty becomes false after writing", () => {
    const ring = new SharedRingBuffer(64);
    ring.write(new Uint8Array([1]));
    expect(ring.isEmpty).toBe(false);
  });

  it("isEmpty returns true after all data is read", () => {
    const ring = new SharedRingBuffer(64);
    ring.write(new Uint8Array(10));
    ring.read(10);
    expect(ring.isEmpty).toBe(true);
  });

  it("isFull is false for a fresh buffer", () => {
    expect(new SharedRingBuffer(64).isFull).toBe(false);
  });

  it("isFull becomes true when ring is at capacity", () => {
    const ring = new SharedRingBuffer(8);
    ring.write(new Uint8Array(8));
    expect(ring.isFull).toBe(true);
  });

  it("isFull returns false after a partial read frees space", () => {
    const ring = new SharedRingBuffer(8);
    ring.write(new Uint8Array(8));
    ring.read(1);
    expect(ring.isFull).toBe(false);
  });

  it("byteLength equals HEADER_SIZE (8) + capacity", () => {
    const ring = new SharedRingBuffer(512);
    expect(ring.byteLength).toBe(8 + 512);
  });

  it("getSharedBuffer returns the same SharedArrayBuffer each time", () => {
    const ring = new SharedRingBuffer(64);
    expect(ring.getSharedBuffer()).toBe(ring.getSharedBuffer());
  });

  it("getSharedBuffer returns a SharedArrayBuffer instance", () => {
    const ring = new SharedRingBuffer(64);
    expect(ring.getSharedBuffer()).toBeInstanceOf(SharedArrayBuffer);
  });
});

// ---------------------------------------------------------------------------
// Partial reads and multi-chunk streaming
// ---------------------------------------------------------------------------

describe("SharedRingBuffer partial reads and streaming", () => {
  it("supports reading in smaller chunks than were written", () => {
    const ring = new SharedRingBuffer(1024);
    const data = new Uint8Array(12).map((_, i) => i + 1); // [1..12]

    ring.write(data);

    const first = assertNotNull(ring.read(4), "first");
    const second = assertNotNull(ring.read(4), "second");
    const third = assertNotNull(ring.read(4), "third");

    expect(Array.from(first)).toEqual([1, 2, 3, 4]);
    expect(Array.from(second)).toEqual([5, 6, 7, 8]);
    expect(Array.from(third)).toEqual([9, 10, 11, 12]);

    expect(ring.isEmpty).toBe(true);
  });

  it("supports writing in smaller chunks than are read in one call", () => {
    const ring = new SharedRingBuffer(1024);

    ring.write(new Uint8Array([1, 2, 3]));
    ring.write(new Uint8Array([4, 5, 6]));
    ring.write(new Uint8Array([7, 8, 9]));

    const result = assertNotNull(ring.read(9), "result");
    expect(Array.from(result)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9]);
  });

  it("simulates streaming multiple HTML chunks through the ring", () => {
    const ring = new SharedRingBuffer(4 * 1024);
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    const chunks = [
      "<!DOCTYPE html><html><head>",
      "<title>Page</title></head>",
      "<body><h1>Hello</h1>",
      "</body></html>",
    ];

    const received: string[] = [];

    for (const chunk of chunks) {
      const encoded = encoder.encode(chunk);
      expect(ring.write(encoded)).toBe(true);
      const read = assertNotNull(ring.read(encoded.byteLength), "read");
      received.push(decoder.decode(read));
    }

    expect(received.join("")).toBe(chunks.join(""));
  });
});
