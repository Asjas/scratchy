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

  it("strips both internal headers in a single request", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-headers",
      headers: {
        "x-internal-request": "true",
        "x-internal-token": "secret",
        "content-type": "application/json",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body).not.toHaveProperty("x-internal-request");
    expect(body).not.toHaveProperty("x-internal-token");
    // Legitimate header preserved
    expect(body).toHaveProperty("content-type", "application/json");
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

  it("strips the server response header added by Fastify", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers).not.toHaveProperty("server");
  });
});
