import { createServer, loadConfig } from "@scratchyjs/core";
import { createStreamingSSRHandler } from "@scratchyjs/renderer";
import type {} from "@scratchyjs/renderer/plugin";
import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// ── Server setup ─────────────────────────────────────────────────────────────
let server: FastifyInstance;

beforeAll(async () => {
  const config = loadConfig({ LOG_LEVEL: "silent" });
  server = await createServer(config);

  // Register the renderer worker pool
  const { default: rendererPlugin } =
    await import("@scratchyjs/renderer/plugin");
  const workerPath = resolve(import.meta.dirname, "renderer", "worker.ts");
  await server.register(rendererPlugin, {
    worker: workerPath,
    minThreads: 1,
    maxThreads: 2,
    taskTimeout: 10_000,
  });

  // Register streaming SSR handlers for each page
  server.get(
    "/",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "home",
        headline: "Ship faster with Scratchy",
      }),
    }),
  );

  server.get(
    "/about",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "about",
        mission: "Make server-rendered web applications fast and ergonomic.",
      }),
    }),
  );

  server.get(
    "/features",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "features",
        features: [
          { title: "Streaming SSR", description: "Stream HTML progressively." },
        ],
      }),
    }),
  );

  server.get(
    "/blog",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "blog",
        posts: [{ id: "1", title: "Getting Started", excerpt: "First steps." }],
      }),
    }),
  );

  server.get(
    "/contact",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "contact",
        email: "hello@scratchyjs.com",
      }),
    }),
  );

  server.get("/*", createStreamingSSRHandler());

  await server.ready();
});

afterAll(async () => {
  await server.close();
});

// ── Health check ─────────────────────────────────────────────────────────────
describe("health check", () => {
  it("GET /health returns 200 with status ok", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; timestamp: string }>();
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});

// ── Streaming SSR worker pool ─────────────────────────────────────────────────
describe("streaming SSR worker pool", () => {
  it("worker pool decorators are registered on the server", () => {
    expect(server.piscina).toBeDefined();
    expect(typeof server.runTask).toBe("function");
  });
});

// ── Page routes ───────────────────────────────────────────────────────────────
describe("page routes — streaming SSR", () => {
  it("GET / returns 200 with HTML containing the app mount point", async () => {
    const response = await server.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!DOCTYPE html>");
    expect(response.body).toContain('<div id="app"');
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("GET /about returns 200 with HTML", async () => {
    const response = await server.inject({ method: "GET", url: "/about" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!DOCTYPE html>");
    expect(response.body).toContain('<div id="app"');
  });

  it("GET /features returns 200 with HTML", async () => {
    const response = await server.inject({ method: "GET", url: "/features" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!DOCTYPE html>");
  });

  it("GET /blog returns 200 with HTML containing embedded props", async () => {
    const response = await server.inject({ method: "GET", url: "/blog" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!DOCTYPE html>");
    // Props are embedded as a JSON script block by the worker
    expect(response.body).toContain("__PROPS__");
  });

  it("GET /contact returns 200 with HTML", async () => {
    const response = await server.inject({ method: "GET", url: "/contact" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!DOCTYPE html>");
  });

  it("catch-all GET /unknown-page returns 200 with HTML", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/unknown-page",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!DOCTYPE html>");
  });

  it("streaming responses set x-content-type-options: nosniff", async () => {
    const routes = ["/", "/about", "/features", "/blog", "/contact"];
    for (const route of routes) {
      const response = await server.inject({ method: "GET", url: route });
      expect(response.headers["x-content-type-options"]).toBe("nosniff");
    }
  });

  it("props are embedded as JSON in the HTML response", async () => {
    const response = await server.inject({ method: "GET", url: "/about" });

    expect(response.statusCode).toBe(200);
    // The placeholder worker embeds props in a <script type="application/json"> block.
    // The JSON content is HTML-escaped to prevent XSS — unescape before parsing.
    const scriptTag = '<script type="application/json" id="__PROPS__">';
    expect(response.body).toContain(scriptTag);
    const jsonStart = response.body.indexOf(scriptTag) + scriptTag.length;
    const jsonEnd = response.body.indexOf("</script>", jsonStart);
    const rawJson = response.body.slice(jsonStart, jsonEnd);
    // Reverse the HTML escaping applied by the worker's escapeHtml() function.
    const json = rawJson
      .replaceAll("&amp;", "&")
      .replaceAll("&lt;", "<")
      .replaceAll("&gt;", ">")
      .replaceAll("&quot;", '"')
      .replaceAll("&#39;", "'");
    const parsed = JSON.parse(json) as Record<string, unknown>;
    expect(parsed.page).toBe("about");
    expect(parsed.mission).toBeDefined();
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────
describe("CORS", () => {
  it("responds with Access-Control-Allow-Origin when Origin header is present", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://example.com",
    );
  });

  it("handles CORS preflight OPTIONS requests", async () => {
    const response = await server.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        "origin": "https://example.com",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toBeDefined();
  });
});
