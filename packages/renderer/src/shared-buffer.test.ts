import {
  BufferStatus,
  createSharedBuffer,
  readFromBuffer,
  writeToBuffer,
} from "./shared-buffer.js";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("createSharedBuffer", () => {
  it("should allocate a SharedArrayBuffer with header + data region", () => {
    const shared = createSharedBuffer(1024);

    expect(shared.buffer).toBeInstanceOf(SharedArrayBuffer);
    // 8 bytes header + 1024 bytes data
    expect(shared.buffer.byteLength).toBe(8 + 1024);
    expect(shared.status).toBeInstanceOf(Int32Array);
    expect(shared.dataLength).toBeInstanceOf(Int32Array);
    expect(shared.data).toBeInstanceOf(Uint8Array);
    expect(shared.data.byteLength).toBe(1024);
  });

  it("should initialize status to IDLE (0)", () => {
    const shared = createSharedBuffer(256);
    expect(Atomics.load(shared.status, 0)).toBe(BufferStatus.IDLE);
  });

  it("should throw RangeError for zero dataSize", () => {
    expect(() => createSharedBuffer(0)).toThrow(RangeError);
  });

  it("should throw RangeError for negative dataSize", () => {
    expect(() => createSharedBuffer(-1)).toThrow(RangeError);
  });
});

describe("writeToBuffer / readFromBuffer round-trip", () => {
  it("should write and read a simple object", () => {
    const shared = createSharedBuffer(4096);
    const payload = { route: "/about", user: { id: "123", name: "Alice" } };

    writeToBuffer(shared, payload);

    expect(Atomics.load(shared.status, 0)).toBe(BufferStatus.DATA_READY);

    const result = readFromBuffer(shared);

    expect(result).toEqual(payload);
    expect(Atomics.load(shared.status, 0)).toBe(BufferStatus.CONSUMED);
  });

  it("should write and read a string payload", () => {
    const shared = createSharedBuffer(1024);
    writeToBuffer(shared, "hello world");

    const result = readFromBuffer<string>(shared);
    expect(result).toBe("hello world");
  });

  it("should write and read an array payload", () => {
    const shared = createSharedBuffer(1024);
    const data = [1, 2, 3, "four", { five: 5 }];

    writeToBuffer(shared, data);
    const result = readFromBuffer(shared);

    expect(result).toEqual(data);
  });

  it("should throw RangeError when payload exceeds buffer capacity", () => {
    const shared = createSharedBuffer(10); // tiny buffer
    const largePayload = { data: "x".repeat(100) };

    expect(() => writeToBuffer(shared, largePayload)).toThrow(RangeError);
    expect(() => writeToBuffer(shared, largePayload)).toThrow(
      /exceeds buffer capacity/,
    );
  });

  it("should throw when writing to a buffer with unread data", () => {
    const shared = createSharedBuffer(4096);
    writeToBuffer(shared, { first: true });

    expect(() => writeToBuffer(shared, { second: true })).toThrow(
      /previous payload has not been consumed/,
    );
  });

  it("should allow writing after consumer reads (CONSUMED state)", () => {
    const shared = createSharedBuffer(4096);

    writeToBuffer(shared, { first: true });
    readFromBuffer(shared); // transitions to CONSUMED

    // Should succeed now
    writeToBuffer(shared, { second: true });
    const result = readFromBuffer(shared);
    expect(result).toEqual({ second: true });
  });

  it("should throw when reading from a buffer in error state", () => {
    const shared = createSharedBuffer(256);
    Atomics.store(shared.status, 0, BufferStatus.ERROR);

    expect(() => readFromBuffer(shared)).toThrow(/error state/);
  });

  it("should throw SyntaxError and set status to ERROR when buffer contains malformed JSON", () => {
    const encoder = new TextEncoder();
    const invalid = encoder.encode("{not valid json}");

    // First call — should throw the original SyntaxError from JSON.parse
    const shared1 = createSharedBuffer(1024);
    shared1.data.set(invalid);
    Atomics.store(shared1.dataLength, 0, invalid.byteLength);
    Atomics.store(shared1.status, 0, BufferStatus.DATA_READY);

    expect(() => readFromBuffer(shared1)).toThrow(SyntaxError);

    // After the parse failure, status must be ERROR so the buffer is not silently reused
    expect(Atomics.load(shared1.status, 0)).toBe(BufferStatus.ERROR);

    // Second buffer — the thrown SyntaxError contains the native JSON.parse message
    const shared2 = createSharedBuffer(1024);
    shared2.data.set(invalid);
    Atomics.store(shared2.dataLength, 0, invalid.byteLength);
    Atomics.store(shared2.status, 0, BufferStatus.DATA_READY);

    // The native JSON.parse SyntaxError is rethrown directly to preserve stack/context.
    expect(() => readFromBuffer(shared2)).toThrow(SyntaxError);
  });
});

describe("BufferStatus", () => {
  it("should expose the expected status constants", () => {
    expect(BufferStatus.IDLE).toBe(0);
    expect(BufferStatus.DATA_READY).toBe(1);
    expect(BufferStatus.CONSUMED).toBe(2);
    expect(BufferStatus.ERROR).toBe(3);
  });
});

describe("readFromBuffer edge cases", () => {
  it("should throw RangeError for invalid data length (negative)", () => {
    const shared = createSharedBuffer(1024);

    // Write valid data first to get to DATA_READY state
    writeToBuffer(shared, { test: true });

    // Corrupt the data length to be negative
    Atomics.store(shared.dataLength, 0, -1);

    expect(() => readFromBuffer(shared)).toThrow(RangeError);
    expect(() => readFromBuffer(shared)).not.toThrow(SyntaxError);

    // After the error, the buffer should be in ERROR state
    expect(Atomics.load(shared.status, 0)).toBe(BufferStatus.ERROR);
  });

  it("should throw RangeError for data length exceeding buffer capacity", () => {
    const shared = createSharedBuffer(100);

    // Set up DATA_READY with oversized length
    Atomics.store(shared.status, 0, BufferStatus.DATA_READY);
    Atomics.store(shared.dataLength, 0, 200); // exceeds 100 byte capacity

    expect(() => readFromBuffer(shared)).toThrow(RangeError);
    expect(Atomics.load(shared.status, 0)).toBe(BufferStatus.ERROR);
  });

  it("should throw on timeout when no data is written", () => {
    const shared = createSharedBuffer(1024);

    // Buffer is in IDLE state, set a very short timeout
    expect(() => readFromBuffer(shared, 1)).toThrow(/Timed out/);
  });

  it("should allow writing after error state is manually reset to IDLE", () => {
    const shared = createSharedBuffer(4096);

    // Put buffer in error state
    Atomics.store(shared.status, 0, BufferStatus.ERROR);

    // Manually reset to IDLE (simulating error recovery)
    Atomics.store(shared.status, 0, BufferStatus.IDLE);

    // Should be able to write again
    writeToBuffer(shared, { recovered: true });
    const result = readFromBuffer(shared);
    expect(result).toEqual({ recovered: true });
  });

  it("should handle writing to a CONSUMED buffer (normal flow)", () => {
    const shared = createSharedBuffer(4096);

    // First write + read cycle
    writeToBuffer(shared, { cycle: 1 });
    const first = readFromBuffer(shared);
    expect(first).toEqual({ cycle: 1 });
    expect(Atomics.load(shared.status, 0)).toBe(BufferStatus.CONSUMED);

    // Second write + read cycle (writing to CONSUMED buffer is allowed)
    writeToBuffer(shared, { cycle: 2 });
    const second = readFromBuffer(shared);
    expect(second).toEqual({ cycle: 2 });
  });

  it("should handle empty object payload", () => {
    const shared = createSharedBuffer(1024);
    writeToBuffer(shared, {});
    const result = readFromBuffer(shared);
    expect(result).toEqual({});
  });

  it("should handle null payload", () => {
    const shared = createSharedBuffer(1024);
    writeToBuffer(shared, null);
    const result = readFromBuffer(shared);
    expect(result).toBeNull();
  });

  it("should handle boolean payload", () => {
    const shared = createSharedBuffer(1024);
    writeToBuffer(shared, true);
    const result = readFromBuffer<boolean>(shared);
    expect(result).toBe(true);
  });

  it("should handle number payload", () => {
    const shared = createSharedBuffer(1024);
    writeToBuffer(shared, 42);
    const result = readFromBuffer<number>(shared);
    expect(result).toBe(42);
  });
});

describe("readFromBuffer post-wait status checks", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should throw when status becomes ERROR after Atomics.wait wakes up", () => {
    const shared = createSharedBuffer(1024);
    // Set to CONSUMED so readFromBuffer enters the wait branch
    Atomics.store(shared.status, 0, BufferStatus.CONSUMED);

    // Mock Atomics.wait to return "ok" (simulating a notify) but leave
    // status as ERROR so the post-wait check triggers
    vi.spyOn(Atomics, "wait").mockImplementation(() => {
      Atomics.store(shared.status, 0, BufferStatus.ERROR);
      return "ok";
    });

    expect(() => readFromBuffer(shared)).toThrow(/error state/);
  });

  it("should throw when status is unexpected after Atomics.wait wakes up", () => {
    const shared = createSharedBuffer(1024);
    // Set to CONSUMED so readFromBuffer enters the wait branch
    Atomics.store(shared.status, 0, BufferStatus.CONSUMED);

    // Mock Atomics.wait to return "ok" but leave status as IDLE (unexpected)
    vi.spyOn(Atomics, "wait").mockImplementation(() => {
      Atomics.store(shared.status, 0, BufferStatus.IDLE);
      return "ok";
    });

    expect(() => readFromBuffer(shared)).toThrow(/Unexpected buffer status/);
  });
});

describe("readFromBuffer non-SyntaxError JSON parse failure", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("should wrap non-SyntaxError thrown by JSON.parse in a SyntaxError", () => {
    const shared = createSharedBuffer(1024);
    // Write valid-looking data so we reach the JSON.parse call
    const encoder = new TextEncoder();
    const data = encoder.encode('{"valid":true}');
    shared.data.set(data);
    Atomics.store(shared.dataLength, 0, data.byteLength);
    Atomics.store(shared.status, 0, BufferStatus.DATA_READY);

    // Make JSON.parse throw a non-SyntaxError
    vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw new TypeError("unexpected type error");
    });

    expect(() => readFromBuffer(shared)).toThrow(SyntaxError);
    expect(() => {
      // Reset buffer for second assertion
      Atomics.store(shared.status, 0, BufferStatus.DATA_READY);
      Atomics.store(shared.dataLength, 0, data.byteLength);
      readFromBuffer(shared);
    }).toThrow(/Failed to parse JSON payload/);
  });

  it("should wrap non-Error thrown by JSON.parse in a SyntaxError", () => {
    const shared = createSharedBuffer(1024);
    const encoder = new TextEncoder();
    const data = encoder.encode('{"valid":true}');
    shared.data.set(data);
    Atomics.store(shared.dataLength, 0, data.byteLength);
    Atomics.store(shared.status, 0, BufferStatus.DATA_READY);

    // Make JSON.parse throw a string (non-Error)
    vi.spyOn(JSON, "parse").mockImplementation(() => {
      throw "string error";
    });

    expect(() => readFromBuffer(shared)).toThrow(SyntaxError);
    expect(Atomics.load(shared.status, 0)).toBe(BufferStatus.ERROR);
  });
});
