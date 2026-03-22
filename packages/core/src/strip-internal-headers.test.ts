import { createServer, loadConfig } from "./index.js";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

describe("strip-internal-headers plugin", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);

    // Add a test route that echoes back the headers it received
    server.get("/test-headers", (request) => {
      return request.headers;
    });

    await server.ready();
  });

  afterEach(async () => {
    await server.close();
  });

  it("strips x-middleware-subrequest header (CVE-2025-29927 bypass pattern)", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-middleware-subrequest": "pages/api/admin",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-middleware-subrequest");
  });

  it("strips x-internal-request header", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-internal-request": "true",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-internal-request");
  });

  it("strips x-middleware-prefetch header", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-middleware-prefetch": "1",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-middleware-prefetch");
  });

  it("strips x-middleware-rewrite header", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-middleware-rewrite": "/admin",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-middleware-rewrite");
  });

  it("strips x-internal-token header", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-internal-token": "secret-bypass-token",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-internal-token");
  });

  it("strips x-remix-response header", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-remix-response": "bypass",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-remix-response");
  });

  it("does not strip legitimate user-supplied headers", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-request-id": "test-123",
        "x-custom-header": "my-value",
        "authorization": "Bearer token",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).toHaveProperty("x-request-id", "test-123");
    expect(body).toHaveProperty("x-custom-header", "my-value");
    expect(body).toHaveProperty("authorization", "Bearer token");
  });

  it("strips multiple internal headers in a single request", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-middleware-subrequest": "bypass",
        "x-internal-request": "true",
        "x-middleware-prefetch": "1",
        "x-remix-response": "yes",
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-middleware-subrequest");
    expect(body).not.toHaveProperty("x-internal-request");
    expect(body).not.toHaveProperty("x-middleware-prefetch");
    expect(body).not.toHaveProperty("x-remix-response");
    // Legitimate header preserved
    expect(body).toHaveProperty("content-type", "application/json");
  });
});
