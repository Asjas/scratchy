import authPlugin from "./plugin.js";
import { createAuth } from "./server.js";
import type { FastifyRequest } from "fastify";
import Fastify from "fastify";
import { getAuthDecorator } from "fastify-better-auth";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

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
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });
    await fastify.ready();

    const authInstance = getAuthDecorator(fastify);
    expect(authInstance).toBeDefined();
    expect(authInstance.api).toBeDefined();
    expect(authInstance.handler).toBeTypeOf("function");
  });

  it("sets session and user to null when getSession throws", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });

    // Override the auth api.getSession to throw an error
    const authInstance = getAuthDecorator(fastify);
    vi.spyOn(authInstance.api, "getSession").mockRejectedValue(
      new Error("session resolution failed"),
    );

    fastify.get("/test-error", (request: FastifyRequest) => {
      return { session: request.session, user: request.user };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/test-error",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ session: null, user: null });

    vi.restoreAllMocks();
  });
});
