import { createServer, loadConfig } from "./index.js";
import stripPlugin from "./plugins/external/a-strip-internal-headers.js";
// Import plugin functions directly to register them in standalone tests.
import corsPlugin from "./plugins/external/cors.js";
// Explicit imports so Istanbul instruments these re-exported config files.
import "./plugins/external/helmet.js";
import "./plugins/external/rate-limit.js";
import "./plugins/external/sensible.js";
import healthRoute from "./routes/health/index.js";
import type { Config } from "./config.js";
import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function makeConfig(overrides: Partial<Config> = {}): Config {
  return {
    PORT: 3000,
    HOST: "0.0.0.0",
    NODE_ENV: "development",
    LOG_LEVEL: "info",
    TRUST_PROXY: true,
    BODY_LIMIT: 10_485_760,
    ALLOWED_ORIGINS: [],
    ...overrides,
  };
}

describe("CORS plugin", () => {
  let server: FastifyInstance;

  afterEach(async () => {
    await server.close();
  });

  it("allows all origins in development mode", async () => {
    const config = loadConfig({ LOG_LEVEL: "silent", NODE_ENV: "development" });
    server = await createServer(config);
    server.get("/test-cors", () => ({ ok: true }));
    await server.ready();

    const response = await server.inject({
      method: "OPTIONS",
      url: "/test-cors",
      headers: { origin: "http://evil.com" },
    });

    // Development mode: origin is reflected back
    expect(response.headers["access-control-allow-origin"]).toBe(
      "http://evil.com",
    );
  });

  it("denies all origins in production with no ALLOWED_ORIGINS", async () => {
    const config = loadConfig({
      LOG_LEVEL: "silent",
      NODE_ENV: "production",
    });
    server = await createServer(config);
    server.get("/test-cors", () => ({ ok: true }));
    await server.ready();

    const response = await server.inject({
      method: "OPTIONS",
      url: "/test-cors",
      headers: { origin: "http://evil.com" },
    });

    // Production mode without ALLOWED_ORIGINS: origin should not be reflected
    expect(response.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows listed origins in production with ALLOWED_ORIGINS set", async () => {
    const config = loadConfig({
      LOG_LEVEL: "silent",
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://app.example.com,https://admin.example.com",
    });
    server = await createServer(config);
    server.get("/test-cors", () => ({ ok: true }));
    await server.ready();

    const allowed = await server.inject({
      method: "OPTIONS",
      url: "/test-cors",
      headers: { origin: "https://app.example.com" },
    });

    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://app.example.com",
    );
  });

  it("rejects unlisted origins in production with ALLOWED_ORIGINS set", async () => {
    const config = loadConfig({
      LOG_LEVEL: "silent",
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://app.example.com",
    });
    server = await createServer(config);
    server.get("/test-cors", () => ({ ok: true }));
    await server.ready();

    const rejected = await server.inject({
      method: "OPTIONS",
      url: "/test-cors",
      headers: { origin: "https://evil.com" },
    });

    // Rejected origin should not appear in the response
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();
  });

  it("allows requests with no Origin header in production (same-origin)", async () => {
    const config = loadConfig({
      LOG_LEVEL: "silent",
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "https://app.example.com",
    });
    server = await createServer(config);
    server.get("/test-cors", () => ({ ok: true }));
    await server.ready();

    const response = await server.inject({
      method: "GET",
      url: "/test-cors",
      // No Origin header — same-origin request
    });

    expect(response.statusCode).toBe(200);
  });
});

describe("Helmet plugin", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("sets X-Frame-Options to DENY", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-frame-options"]).toBe("DENY");
  });

  it("sets X-Content-Type-Options to nosniff", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-content-type-options"]).toBe("nosniff");
  });

  it("does not set X-Powered-By header", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-powered-by"]).toBeUndefined();
  });
});

describe("Rate-limit plugin", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("adds rate-limit headers to responses", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.headers["x-ratelimit-limit"]).toBeDefined();
    expect(response.headers["x-ratelimit-remaining"]).toBeDefined();
  });
});

describe("Sensible plugin", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("adds httpErrors to the server instance", () => {
    expect(server.httpErrors).toBeDefined();
    expect(server.httpErrors.notFound).toBeTypeOf("function");
  });
});

describe("Health route", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns status ok and a timestamp", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });
    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
  });
});

// ── Direct-registration tests ─────────────────────────────────────────────
// These tests register the plugin directly (not via autoload) so Istanbul
// instruments the function body.

describe("strip-internal-headers (direct registration)", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = Fastify({ logger: false });
    await server.register(stripPlugin);
    server.get("/echo", (request) => request.headers);
    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("deletes x-internal-request and x-internal-token headers", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/echo",
      headers: {
        "x-internal-request": "true",
        "x-internal-token": "secret",
        "x-custom": "keep",
      },
    });

    const body = res.json();
    expect(body).not.toHaveProperty("x-internal-request");
    expect(body).not.toHaveProperty("x-internal-token");
    expect(body).toHaveProperty("x-custom", "keep");
  });

  it("removes the server response header", async () => {
    const res = await server.inject({ method: "GET", url: "/echo" });
    expect(res.headers).not.toHaveProperty("server");
  });
});

describe("CORS plugin (direct registration)", () => {
  afterEach(async () => {
    // Each test creates its own server
  });

  it("registers the cors plugin via the exported fp wrapper", async () => {
    const server = Fastify({ logger: false });
    // The CORS plugin reads fastify.config — decorate before registering
    server.decorate("config", makeConfig({ NODE_ENV: "development" }));
    await server.register(corsPlugin);
    server.get("/test", () => ({ ok: true }));
    await server.ready();

    const res = await server.inject({
      method: "OPTIONS",
      url: "/test",
      headers: { origin: "http://any.com" },
    });

    // Development mode reflects origin
    expect(res.headers["access-control-allow-origin"]).toBe("http://any.com");

    await server.close();
  });

  it("rejects origins in production without allowlist", async () => {
    const server = Fastify({ logger: false });
    server.decorate("config", makeConfig({ NODE_ENV: "production" }));
    await server.register(corsPlugin);
    server.get("/test", () => ({ ok: true }));
    await server.ready();

    const res = await server.inject({
      method: "OPTIONS",
      url: "/test",
      headers: { origin: "http://evil.com" },
    });

    expect(res.headers["access-control-allow-origin"]).toBeUndefined();

    await server.close();
  });

  it("allows listed origins in production", async () => {
    const server = Fastify({ logger: false });
    server.decorate(
      "config",
      makeConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: ["https://good.com"],
      }),
    );
    await server.register(corsPlugin);
    server.get("/test", () => ({ ok: true }));
    await server.ready();

    const allowed = await server.inject({
      method: "OPTIONS",
      url: "/test",
      headers: { origin: "https://good.com" },
    });
    expect(allowed.headers["access-control-allow-origin"]).toBe(
      "https://good.com",
    );

    const rejected = await server.inject({
      method: "OPTIONS",
      url: "/test",
      headers: { origin: "https://bad.com" },
    });
    expect(rejected.headers["access-control-allow-origin"]).toBeUndefined();

    await server.close();
  });

  it("allows requests with no origin in production allowlist mode", async () => {
    const server = Fastify({ logger: false });
    server.decorate(
      "config",
      makeConfig({
        NODE_ENV: "production",
        ALLOWED_ORIGINS: ["https://good.com"],
      }),
    );
    await server.register(corsPlugin);
    server.get("/test", () => ({ ok: true }));
    await server.ready();

    const res = await server.inject({
      method: "GET",
      url: "/test",
      // No Origin header
    });
    expect(res.statusCode).toBe(200);

    await server.close();
  });
});

describe("Health route (direct registration)", () => {
  it("responds to /health with status ok", async () => {
    const server = Fastify({ logger: false });
    await server.register(healthRoute);
    await server.ready();

    const res = await server.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();

    await server.close();
  });
});
