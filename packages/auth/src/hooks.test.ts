import { requireAdmin, requireAuth } from "./hooks.js";
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

describe("requireAuth", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(() => {
    fastify = Fastify({ logger: false });
  });

  afterEach(async () => {
    await fastify.close();
  });

  it("returns 401 when no session exists", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });

    fastify.get("/protected", { preHandler: requireAuth }, () => {
      return { success: true };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Unauthorized",
      message: "You must be logged in to access this resource",
    });
  });

  it("allows request when session exists", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });

    // Simulate an authenticated session by adding a hook before requireAuth
    fastify.addHook("onRequest", async (request: FastifyRequest) => {
      request.session = {
        session: {
          id: "sess-1",
          userId: "user-1",
          token: "token-abc",
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        user: {
          id: "user-1",
          name: "Test User",
          email: "test@example.com",
          role: "member",
        },
      };
    });

    fastify.get("/protected", { preHandler: requireAuth }, () => {
      return { success: true };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/protected",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });
});

describe("requireAdmin", () => {
  let fastify: ReturnType<typeof Fastify>;

  beforeEach(() => {
    fastify = Fastify({ logger: false });
  });

  afterEach(async () => {
    await fastify.close();
  });

  it("returns 401 when no session exists", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });

    fastify.get("/admin", { preHandler: requireAdmin }, () => {
      return { success: true };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({
      error: "Unauthorized",
      message: "You must be logged in to access this resource",
    });
  });

  it("returns 403 when user is not admin", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });

    fastify.addHook("onRequest", async (request: FastifyRequest) => {
      request.session = {
        session: {
          id: "sess-1",
          userId: "user-1",
          token: "token-abc",
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        user: {
          id: "user-1",
          name: "Regular User",
          email: "user@example.com",
          role: "member",
        },
      };
    });

    fastify.get("/admin", { preHandler: requireAdmin }, () => {
      return { success: true };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin",
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toEqual({
      error: "Forbidden",
      message: "Admin access required",
    });
  });

  it("allows request when user has admin role", async () => {
    const auth = buildAuth();
    await fastify.register(authPlugin, { auth });

    fastify.addHook("onRequest", async (request: FastifyRequest) => {
      request.session = {
        session: {
          id: "sess-1",
          userId: "admin-1",
          token: "token-abc",
          expiresAt: new Date(Date.now() + 86_400_000),
        },
        user: {
          id: "admin-1",
          name: "Admin User",
          email: "admin@example.com",
          role: "admin",
        },
      };
    });

    fastify.get("/admin", { preHandler: requireAdmin }, () => {
      return { success: true };
    });

    const response = await fastify.inject({
      method: "GET",
      url: "/admin",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ success: true });
  });
});
