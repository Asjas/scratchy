import type { RenderResult, RenderTask } from "./worker.js";
import Fastify from "fastify";
import { resolve } from "node:path";
import { describe, expect, it, vi } from "vitest";

describe("renderer plugin", () => {
  it("should decorate fastify with piscina and runTask", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    await server.ready();

    expect(server.piscina).toBeDefined();
    expect(typeof server.runTask).toBe("function");

    await server.close();
  });

  it("should run an SSR task through the worker pool", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    await server.ready();

    const result = await server.runTask<RenderTask, RenderResult>({
      type: "ssr",
      route: "/test",
      props: { greeting: "hello" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain('data-route="/test"');
    expect(result.html).toContain("&quot;greeting&quot;:&quot;hello&quot;");

    await server.close();
  });

  it("should run an SSG task through the worker pool", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    await server.ready();

    const result = await server.runTask<RenderTask, RenderResult>({
      type: "ssg",
      route: "/static-page",
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain('data-ssg="true"');
    expect(result.html).toContain('data-route="/static-page"');

    await server.close();
  });

  it("should close the worker pool when the server closes", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    await server.ready();

    const pool = server.piscina;
    expect(pool).toBeDefined();

    // Closing the server should also close the pool
    await server.close();

    // After close, the pool threads should be terminated
    expect(pool.threads.length).toBe(0);
  });

  it("should use custom idleTimeout and taskTimeout", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
      idleTimeout: 30_000,
      taskTimeout: 15_000,
    });

    await server.ready();

    expect(server.piscina).toBeDefined();
    expect(typeof server.runTask).toBe("function");

    await server.close();
  });
});

describe("renderer plugin — validation", () => {
  function makeMockFastify() {
    return {
      decorate: vi.fn(),
      addHook: vi.fn(),
      log: { info: vi.fn() },
    };
  }

  it("should throw RangeError for invalid minThreads", async () => {
    const plugin = (await import("./plugin.js")).default;
    const mockFastify = makeMockFastify();

    expect(() => {
      plugin(mockFastify as unknown as import("fastify").FastifyInstance, {
        worker: "worker.ts",
        minThreads: 0,
        maxThreads: 2,
      });
    }).toThrow(RangeError);
  });

  it("should throw RangeError for invalid maxThreads", async () => {
    const plugin = (await import("./plugin.js")).default;
    const mockFastify = makeMockFastify();

    expect(() => {
      plugin(mockFastify as unknown as import("fastify").FastifyInstance, {
        worker: "worker.ts",
        minThreads: 1,
        maxThreads: 0,
      });
    }).toThrow(RangeError);
  });

  it("should throw RangeError when minThreads > maxThreads", async () => {
    const plugin = (await import("./plugin.js")).default;
    const mockFastify = makeMockFastify();

    expect(() => {
      plugin(mockFastify as unknown as import("fastify").FastifyInstance, {
        worker: "worker.ts",
        minThreads: 4,
        maxThreads: 2,
      });
    }).toThrow(RangeError);
  });
});
