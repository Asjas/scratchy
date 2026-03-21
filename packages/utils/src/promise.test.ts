import { TimeoutError, promiseHash, timeout } from "./promise.js";
import { describe, expect, it, vi } from "vitest";

describe("promiseHash", () => {
  it("resolves all promises in an object", async () => {
    const result = await promiseHash({
      a: Promise.resolve(1),
      b: Promise.resolve("hello"),
      c: Promise.resolve(true),
    });

    expect(result).toEqual({ a: 1, b: "hello", c: true });
  });

  it("resolves promises in parallel", async () => {
    const order: string[] = [];

    const result = await promiseHash({
      first: new Promise<string>((resolve) => {
        setTimeout(() => {
          order.push("first");
          resolve("first");
        }, 10);
      }),
      second: new Promise<string>((resolve) => {
        setTimeout(() => {
          order.push("second");
          resolve("second");
        }, 5);
      }),
    });

    expect(result).toEqual({ first: "first", second: "second" });
    // Both ran concurrently so "second" finishes first
    expect(order).toEqual(["second", "first"]);
  });

  it("rejects when any promise rejects", async () => {
    await expect(
      promiseHash({
        ok: Promise.resolve(1),
        bad: Promise.reject(new Error("fail")),
      }),
    ).rejects.toThrow("fail");
  });

  it("supports nested promiseHash", async () => {
    const result = await promiseHash({
      outer: Promise.resolve("outer"),
      inner: promiseHash({
        nested: Promise.resolve("nested"),
      }),
    });

    expect(result).toEqual({ outer: "outer", inner: { nested: "nested" } });
  });

  it("returns an empty object for an empty input", async () => {
    const result = await promiseHash({});
    expect(result).toEqual({});
  });
});

describe("timeout", () => {
  it("resolves when the promise settles before the timeout", async () => {
    const result = await timeout(Promise.resolve(42), { ms: 1000 });
    expect(result).toBe(42);
  });

  it("throws TimeoutError when the timeout fires first", async () => {
    const slow = new Promise<number>((resolve) => setTimeout(resolve, 500));

    await expect(timeout(slow, { ms: 10 })).rejects.toBeInstanceOf(
      TimeoutError,
    );
  });

  it("TimeoutError message includes the timeout duration", async () => {
    const slow = new Promise<never>((resolve) => {
      setTimeout(resolve, 500);
    });

    await expect(timeout(slow, { ms: 10 })).rejects.toThrow(
      "Timed out after 10ms",
    );
  });

  it("aborts the controller when the timeout fires", async () => {
    const controller = new AbortController();
    const slow = new Promise<number>((resolve) => {
      setTimeout(resolve, 500);
    });

    await expect(timeout(slow, { ms: 10, controller })).rejects.toBeInstanceOf(
      TimeoutError,
    );
    expect(controller.signal.aborted).toBe(true);
  });

  it("does not abort the controller when the promise resolves in time", async () => {
    const controller = new AbortController();

    const result = await timeout(Promise.resolve("ok"), {
      ms: 1000,
      controller,
    });

    expect(result).toBe("ok");
    expect(controller.signal.aborted).toBe(false);
  });

  it("re-throws rejection from the original promise", async () => {
    const err = new Error("original error");
    await expect(timeout(Promise.reject(err), { ms: 1000 })).rejects.toThrow(
      "original error",
    );
  });

  it("TimeoutError has the correct name", async () => {
    const slow = new Promise<never>((_resolve) => setTimeout(_resolve, 500));
    try {
      await timeout(slow, { ms: 10 });
    } catch (error) {
      expect((error as Error).name).toBe("TimeoutError");
    }
  });

  it("clears the timer after a successful resolution", async () => {
    const clearSpy = vi.spyOn(globalThis, "clearTimeout");
    await timeout(Promise.resolve("done"), { ms: 1000 });
    expect(clearSpy).toHaveBeenCalled();
    clearSpy.mockRestore();
  });
});

describe("TimeoutError", () => {
  it("is an instance of Error", () => {
    const err = new TimeoutError("test");
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(TimeoutError);
  });

  it("has name TimeoutError", () => {
    const err = new TimeoutError("test");
    expect(err.name).toBe("TimeoutError");
  });

  it("stores the message", () => {
    const err = new TimeoutError("timed out after 100ms");
    expect(err.message).toBe("timed out after 100ms");
  });
});
