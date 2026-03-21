import authPlugin from "./plugin.js";
import { createAuth } from "./server.js";
import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

function buildAuth() {
  return createAuth({
    basePath: "/api/auth",
    secret: "test-secret-at-least-32-characters-long",
  });
}

describe("authPlugin", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(() => {
    fastify = Fastify({ logger: false });
  });

  afterEach(async () => {
    await fastify.close();
  });

  it("registers without error", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });
    await fastify.ready();
  });

  it("decorates request with session and user (null when unauthenticated)", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });

    fastify.get("/test", (request: FastifyRequest) => {
      return { session: request.session, user: request.user };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ session: null, user: null });
  });

  it("makes the auth instance available via getAuthDecorator", async () => {
    const { getAuthDecorator } = await import("fastify-better-auth");
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });
    await fastify.ready();

    const authInstance = getAuthDecorator(fastify);
    expect(authInstance).toBeDefined();
    expect(authInstance.api).toBeDefined();
    expect(authInstance.handler).toBeTypeOf("function");
  });
});
