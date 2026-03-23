import { createStreamingSSRHandler } from "./streaming-ssr-handler.js";
import Fastify from "fastify";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

describe("createStreamingSSRHandler", () => {
  it("should stream an SSR page and return full HTML with expected headers", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get("/streaming", createStreamingSSRHandler());

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/streaming",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toBe("text/html; charset=utf-8");
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
    // Fastify's inject() collects the streamed chunks into a single body.
    expect(response.body).toContain("<!DOCTYPE html>");
    expect(response.body).toContain('data-route="/streaming"');
    expect(response.body).toContain('data-streaming="true"');
    expect(response.body).toContain("</body>");
    expect(response.body).toContain("</html>");

    await server.close();
  });

  it("should produce a complete HTML document across all chunks", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get("/full-doc", createStreamingSSRHandler());

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/full-doc",
    });

    expect(response.statusCode).toBe(200);
    // The three chunks should produce a well-formed HTML document.
    expect(response.body).toContain("<html");
    expect(response.body).toContain("<head>");
    expect(response.body).toContain('<meta charset="utf-8">');
    expect(response.body).toContain("<body>");
    expect(response.body).toContain("</body>");
    expect(response.body).toContain("</html>");

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
      createStreamingSSRHandler({
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
      createStreamingSSRHandler({
        getProps: async () => ({ async: true }),
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

    server.get("/no-opts", createStreamingSSRHandler());

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/no-opts",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toContain("<!DOCTYPE html>");

    await server.close();
  });

  it("should apply extra response headers from the render result", async () => {
    const server = Fastify({ logger: false });

    // Manually decorate runTask so we control the exact StreamingRenderResult.
    server.decorate("runTask", async () => ({
      chunks: ["<html>", "<body>page</body>", "</html>"],
      statusCode: 200,
      headers: { "x-custom-header": "my-value" },
    }));

    server.get("/extra-headers", createStreamingSSRHandler());
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/extra-headers",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["x-custom-header"]).toBe("my-value");
    expect(response.headers["content-type"]).toContain("text/html");

    await server.close();
  });

  it("should not allow the render result to override the content-type header", async () => {
    const server = Fastify({ logger: false });

    server.decorate("runTask", async () => ({
      chunks: ["<html><body>hello</body></html>"],
      statusCode: 200,
      // A worker returning its own content-type should NOT overwrite ours.
      headers: { "content-type": "text/plain" },
    }));

    server.get("/no-ct-override", createStreamingSSRHandler());
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/no-ct-override",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");

    await server.close();
  });

  it("should not produce XSS output for safe routes", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get("/safe-route", createStreamingSSRHandler());
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/safe-route",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain("<script>alert(");

    await server.close();
  });

  it("should include props in a script tag for XSS prevention", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      worker: resolve(import.meta.dirname, "worker.ts"),
      minThreads: 1,
      maxThreads: 2,
    });

    server.get(
      "/props-escape",
      createStreamingSSRHandler({
        getProps: () => ({
          xss: '</script><script>alert("xss")</script>',
        }),
      }),
    );

    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/props-escape",
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).not.toContain(
      '</script><script>alert("xss")</script>',
    );
    expect(response.body).toContain("&lt;/script&gt;");

    await server.close();
  });
});
