import {
  BufferStatus,
  createSharedBuffer,
  readFromBuffer,
  writeToBuffer,
} from "./shared-buffer.js";
import { describe, expect, it } from "vitest";

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

    // First call — should throw SyntaxError with our message
    const shared1 = createSharedBuffer(1024);
    shared1.data.set(invalid);
    Atomics.store(shared1.dataLength, 0, invalid.byteLength);
    Atomics.store(shared1.status, 0, BufferStatus.DATA_READY);

    expect(() => readFromBuffer(shared1)).toThrow(SyntaxError);

    // After the parse failure, status must be ERROR so the buffer is not silently reused
    expect(Atomics.load(shared1.status, 0)).toBe(BufferStatus.ERROR);

    // Second buffer — verify the error message matches
    const shared2 = createSharedBuffer(1024);
    shared2.data.set(invalid);
    Atomics.store(shared2.dataLength, 0, invalid.byteLength);
    Atomics.store(shared2.status, 0, BufferStatus.DATA_READY);

    expect(() => readFromBuffer(shared2)).toThrow(
      /Failed to parse JSON payload/,
    );
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
