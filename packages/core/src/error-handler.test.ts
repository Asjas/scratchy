import { createServer, loadConfig } from "./index.js";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

describe("error handler", () => {
  let server: FastifyInstance;

  beforeAll(async () => {
    const config = loadConfig({ LOG_LEVEL: "silent" });
    server = await createServer(config);

    // Register a route that throws a generic error (no statusCode)
    server.get("/test-error", () => {
      throw new Error("something went wrong");
    });

    // Register a route that throws an error with a statusCode
    server.get("/test-status-error", () => {
      const err = new Error("forbidden access") as Error & {
        statusCode: number;
      };
      err.statusCode = 403;
      throw err;
    });

    // Register a route with Zod schema validation
    server.post(
      "/test-validation",
      {
        schema: {
          body: z.object({
            name: z.string().min(1),
            email: z.string().email(),
          }),
        },
      },
      (_request: FastifyRequest, reply: FastifyReply) => {
        return reply.send({ ok: true });
      },
    );

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

  it("should return 500 for unhandled errors without statusCode", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-error",
    });

    expect(response.statusCode).toBe(500);
    const body = response.json();
    expect(body.error).toBe("Internal Server Error");
    expect(body.message).toBe("An unexpected error occurred");
  });

  it("should return the error statusCode when present", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/test-status-error",
    });

    expect(response.statusCode).toBe(403);
    const body = response.json();
    expect(body.message).toBe("forbidden access");
  });

  it("should return 400 for Zod schema validation errors", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/test-validation",
      payload: { name: "", email: "not-an-email" },
    });

    expect(response.statusCode).toBe(400);
    const body = response.json();
    expect(body.error).toBe("Validation Error");
    expect(body.message).toBe("Request doesn't match the schema");
    expect(body.details).toBeDefined();
    expect(body.details.issues).toBeDefined();
  });
});
