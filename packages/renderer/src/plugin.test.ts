import Fastify from "fastify";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

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

    const result = await server.runTask({
      type: "ssr",
      route: "/test",
      props: { greeting: "hello" },
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain('data-route="/test"');
    expect(result.html).toContain('"greeting":"hello"');

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

    const result = await server.runTask({
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
});
