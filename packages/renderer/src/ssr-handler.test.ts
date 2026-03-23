import { createSSRHandler } from "./ssr-handler.js";
import Fastify from "fastify";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("createSSRHandler", () => {
  it("should render a basic SSR page", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get("/test", createSSRHandler());

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/test",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.body).toContain("<!DOCTYPE html>");
    expect(response.body).toContain('data-route="/test"');

    await server.close();
  });

  it("should pass props from getProps to the renderer", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get(
      "/with-props",
      createSSRHandler({
        getProps: (request) => ({ url: request.url, greeting: "hello" }),
      }),
    );

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/with-props",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("&quot;greeting&quot;:&quot;hello&quot;");

    await server.close();
  });

  it("should pass async getProps to the renderer", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get(
      "/async-props",
      createSSRHandler({
        getProps: async () => {
          return { async: true };
        },
      }),
    );

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/async-props",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("&quot;async&quot;:true");

    await server.close();
  });

  it("should work with no options", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get("/no-opts", createSSRHandler());

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/no-opts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<!DOCTYPE html>");

    await server.close();
  });

  it("should not override content-type when result includes a content-type header", async () => {
    // Create a fresh server without the renderer plugin — manually decorate runTask
    const server = Fastify({ logger: false });

    server.decorate("runTask", async () => ({
      html: "<html><body>custom</body></html>",
      head: "",
      statusCode: 200,
      headers: { "content-type": "text/html; charset=utf-8; custom=true" },
    }));

    server.get("/with-headers", createSSRHandler());
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/with-headers",
    });

    expect(response.statusCode).toBe(200);
    // The custom content-type from headers should be present
    expect(response.headers["content-type"]).toContain("custom=true");

    await server.close();
  });

  it("should apply extra headers from the render result", async () => {
    // Create a fresh server without the renderer plugin — manually decorate runTask
    const server = Fastify({ logger: false });

    server.decorate("runTask", async () => ({
      html: "<html><body>page</body></html>",
      head: "",
      statusCode: 200,
      headers: { "x-custom-header": "my-value" },
    }));

    server.get("/extra-headers", createSSRHandler());
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/extra-headers",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-custom-header"]).toBe("my-value");
    // content-type should default since it's not in headers
    expect(response.headers["content-type"]).toContain("text/html");

    await server.close();
  });
});
