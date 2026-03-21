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

  it("should throw when reading from a buffer in error state", () => {
    const shared = createSharedBuffer(256);
    Atomics.store(shared.status, 0, BufferStatus.ERROR);

    expect(() => readFromBuffer(shared)).toThrow(/error state/);
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
