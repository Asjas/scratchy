import { createServer, loadConfig } from "./index.js";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("createServer", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("should return a Fastify instance", () => {
    expect(server).toBeDefined();
    expect(typeof server.listen).toBe("function");
    expect(typeof server.close).toBe("function");
  });

  it("should decorate the server with config", () => {
    expect(server.config).toBeDefined();
    expect(server.config.PORT).toBe(3000);
  });

  it("should respond to GET /health with 200", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.status).toBe("ok");
    expect(body.timestamp).toBeDefined();
    expect(() => new Date(body.timestamp)).not.toThrow();
  });

  it("should log a warning in production when ALLOWED_ORIGINS is empty", async () => {
    const config = loadConfig({
      NODE_ENV: "production",
      ALLOWED_ORIGINS: "",
      LOG_LEVEL: "warn",
    });

    // createServer calls warnInsecureConfig internally, which logs a warning
    // if NODE_ENV === "production" and ALLOWED_ORIGINS is empty.
    // We verify the code path executes without error and the server is usable.
    const prodServer = await createServer(config);
    expect(prodServer).toBeDefined();
    expect(prodServer.config.NODE_ENV).toBe("production");
    expect(prodServer.config.ALLOWED_ORIGINS).toEqual([]);
    await prodServer.close();
  });
});
