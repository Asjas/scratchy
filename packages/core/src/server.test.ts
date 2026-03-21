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
});
