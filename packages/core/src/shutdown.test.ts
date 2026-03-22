import { setupShutdown } from "./shutdown.js";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock close-with-grace to capture the callback without actually
// registering a process signal handler.
vi.mock("close-with-grace", () => ({
  default: vi.fn(),
}));

describe("setupShutdown", () => {
  afterEach(() => {
    vi.restoreAllMocks();
    // Remove listeners we added so they don't leak across tests
    process.removeAllListeners("uncaughtException");
    process.removeAllListeners("unhandledRejection");
  });

  it("registers uncaughtException and unhandledRejection listeners", async () => {
    const server = Fastify({ logger: false });
    await server.ready();

    const beforeUncaught = process.listenerCount("uncaughtException");
    const beforeUnhandled = process.listenerCount("unhandledRejection");

    setupShutdown(server);

    expect(process.listenerCount("uncaughtException")).toBe(beforeUncaught + 1);
    expect(process.listenerCount("unhandledRejection")).toBe(
      beforeUnhandled + 1,
    );

    await server.close();
  });

  it("calls closeWithGrace", async () => {
    const closeWithGrace = await import("close-with-grace");
    const server = Fastify({ logger: false });
    await server.ready();

    setupShutdown(server);

    expect(closeWithGrace.default).toHaveBeenCalledOnce();
    expect(closeWithGrace.default).toHaveBeenCalledWith(expect.any(Function));

    await server.close();
  });

  it("invokes the onShutdown callback when provided", async () => {
    const closeWithGrace = await import("close-with-grace");
    const server = Fastify({ logger: false });
    await server.ready();

    const onShutdown = vi.fn().mockResolvedValue(undefined);
    setupShutdown(server, onShutdown);

    // Extract the callback passed to closeWithGrace and invoke it
    const callback = vi.mocked(closeWithGrace.default).mock
      .calls[0]?.[0] as (opts: {
      signal: string;
      err?: Error;
    }) => Promise<void>;

    await callback({ signal: "SIGTERM" });

    expect(onShutdown).toHaveBeenCalledOnce();
  });

  it("closes the server in the closeWithGrace callback", async () => {
    const closeWithGrace = await import("close-with-grace");
    const server = Fastify({ logger: false });
    await server.ready();

    setupShutdown(server);

    const callback = vi.mocked(closeWithGrace.default).mock
      .calls[0]?.[0] as (opts: {
      signal: string;
      err?: Error;
    }) => Promise<void>;

    // server.close should not throw
    await callback({ signal: "SIGINT" });
  });

  it("logs error when closeWithGrace callback receives an error", async () => {
    const closeWithGrace = await import("close-with-grace");
    const server = Fastify({ logger: false });
    await server.ready();

    const logError = vi.spyOn(server.log, "error");

    setupShutdown(server);

    const callback = vi.mocked(closeWithGrace.default).mock
      .calls[0]?.[0] as (opts: {
      signal: string;
      err?: Error;
    }) => Promise<void>;

    const testError = new Error("test error");
    await callback({ signal: "SIGTERM", err: testError });

    expect(logError).toHaveBeenCalled();
  });

  it("logs signal info when closing without error", async () => {
    const closeWithGrace = await import("close-with-grace");
    const server = Fastify({ logger: false });
    await server.ready();

    const logInfo = vi.spyOn(server.log, "info");

    setupShutdown(server);

    const callback = vi.mocked(closeWithGrace.default).mock
      .calls[0]?.[0] as (opts: {
      signal: string;
      err?: Error;
    }) => Promise<void>;

    await callback({ signal: "SIGTERM" });

    expect(logInfo).toHaveBeenCalledWith("SIGTERM received, server closing");
  });

  it("logs uncaught exceptions via the process handler", async () => {
    const server = Fastify({ logger: false });
    await server.ready();

    const logError = vi.spyOn(server.log, "error");

    setupShutdown(server);

    // Extract and invoke the uncaughtException handler
    const listeners = process.listeners("uncaughtException");
    const ourListener = listeners[listeners.length - 1] as (err: Error) => void;
    const testError = new Error("test uncaught");
    ourListener(testError);

    expect(logError).toHaveBeenCalledWith(
      { err: testError },
      "Uncaught Exception occurred",
    );
  });

  it("logs unhandled rejections via the process handler", async () => {
    const server = Fastify({ logger: false });
    await server.ready();

    const logError = vi.spyOn(server.log, "error");

    setupShutdown(server);

    // Extract and invoke the unhandledRejection handler
    const listeners = process.listeners("unhandledRejection");
    const ourListener = listeners[listeners.length - 1] as (
      reason: unknown,
      promise: Promise<unknown>,
    ) => void;
    const testReason = "test rejection reason";
    const testPromise = Promise.resolve();
    ourListener(testReason, testPromise);

    expect(logError).toHaveBeenCalledWith(
      { reason: testReason, promise: testPromise },
      "Unhandled Rejection occurred",
    );
  });
});
