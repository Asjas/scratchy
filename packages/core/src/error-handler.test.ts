import { createServer, loadConfig } from "./index.js";
import type { FastifyInstance } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

describe("error handler", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);
    await server.ready();
  });

  afterAll(async () => {
    await server.close();
  });

  it("should return 404 for unknown routes", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/nonexistent-route",
    });

    expect(response.statusCode).toBe(404);
    const body = response.json();
    expect(body.error).toBe("Not Found");
    expect(body.message).toBe("The requested resource was not found");
  });
});
