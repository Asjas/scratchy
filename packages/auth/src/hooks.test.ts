import {
  requireAdmin,
  requireAuth,
  requireOwner,
  requireOwnerOrAdmin,
} from "./hooks.js";
// Import plugin to activate the FastifyRequest.user augmentation in this test file
import type {} from "./plugin.js";
import type { AuthUser } from "./types.js";
import type { FastifyReply, FastifyRequest } from "fastify";
import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function buildMockRequest(user: FastifyRequest["user"]): FastifyRequest {
  return { user } as unknown as FastifyRequest;
}

interface MockReply extends FastifyReply {
  _statusCode: number;
  _body: unknown;
}

function buildMockReply(): MockReply {
  const reply: MockReply = {
    _statusCode: 200,
    _body: undefined,
    sent: false,
    code(statusCode: number) {
      reply._statusCode = statusCode;
      return reply as unknown as FastifyReply;
    },
    send(body: unknown) {
      reply._body = body;
      reply.sent = true;
      return reply as unknown as FastifyReply;
    },
  } as unknown as MockReply;
  return reply;
}

describe("requireAuth", () => {
  it("should do nothing when user is authenticated and not banned", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    await requireAuth(request, reply);

    expect(reply.sent).toBe(false);
  });

  it("should send 401 when user is not authenticated", async () => {
    const request = buildMockRequest(null);
    const reply = buildMockReply();

    await requireAuth(request, reply);

    expect(reply._statusCode).toBe(401);
    expect(reply.sent).toBe(true);
  });

  it("should send 403 when user is banned", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    await requireAuth(request, reply);

    expect(reply._statusCode).toBe(403);
    expect(reply.sent).toBe(true);
  });
});

describe("requireAdmin", () => {
  it("should do nothing when user is an admin", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Admin",
      email: "admin@example.com",
      emailVerified: true,
      role: "admin",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    await requireAdmin(request, reply);

    expect(reply.sent).toBe(false);
  });

  it("should send 403 when user has member role", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    await requireAdmin(request, reply);

    expect(reply._statusCode).toBe(403);
    expect(reply.sent).toBe(true);
  });

  it("should send 401 when user is not authenticated", async () => {
    const request = buildMockRequest(null);
    const reply = buildMockReply();

    await requireAdmin(request, reply);

    expect(reply._statusCode).toBe(401);
    expect(reply.sent).toBe(true);
  });

  it("should send 403 when user is banned (auth check fires first)", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "admin",
      banned: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    await requireAdmin(request, reply);

    // banned check happens inside requireAuth, so we get 403 from banned
    expect(reply._statusCode).toBe(403);
    expect(reply.sent).toBe(true);
  });
});

describe("requireOwner", () => {
  it("should do nothing when user is the resource owner", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    const hook = requireOwner(() => "user-1");
    await hook(request, reply);

    expect(reply.sent).toBe(false);
  });

  it("should send 403 when user is not the resource owner", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    const hook = requireOwner(() => "user-2");
    await hook(request, reply);

    expect(reply._statusCode).toBe(403);
    expect(reply.sent).toBe(true);
  });

  it("should send 401 when user is not authenticated", async () => {
    const request = buildMockRequest(null);
    const reply = buildMockReply();

    const hook = requireOwner(() => "user-1");
    await hook(request, reply);

    expect(reply._statusCode).toBe(401);
    expect(reply.sent).toBe(true);
  });
});

describe("requireOwnerOrAdmin", () => {
  it("should allow access when user is the owner", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    const hook = requireOwnerOrAdmin(() => "user-1");
    await hook(request, reply);

    expect(reply.sent).toBe(false);
  });

  it("should allow access when user is an admin", async () => {
    const request = buildMockRequest({
      id: "admin-1",
      name: "Admin",
      email: "admin@example.com",
      emailVerified: true,
      role: "admin",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    const hook = requireOwnerOrAdmin(() => "user-999");
    await hook(request, reply);

    expect(reply.sent).toBe(false);
  });

  it("should send 403 when user is neither owner nor admin", async () => {
    const request = buildMockRequest({
      id: "user-1",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: false,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    const reply = buildMockReply();

    const hook = requireOwnerOrAdmin(() => "user-2");
    await hook(request, reply);

    expect(reply._statusCode).toBe(403);
    expect(reply.sent).toBe(true);
  });

  it("should send 401 when user is not authenticated", async () => {
    const request = buildMockRequest(null);
    const reply = buildMockReply();

    const hook = requireOwnerOrAdmin(() => "user-1");
    await hook(request, reply);

    expect(reply._statusCode).toBe(401);
    expect(reply.sent).toBe(true);
  });
});

describe("hooks integration with Fastify", () => {
  let server: ReturnType<typeof Fastify>;

  beforeEach(() => {
    server = Fastify({ logger: false });
  });

  afterEach(async () => {
    await server.close();
    vi.clearAllMocks();
  });

  it("requireAuth should block unauthenticated requests", async () => {
    server.decorateRequest("user", null);
    server.get("/protected", { preHandler: requireAuth }, async () => ({
      ok: true,
    }));
    await server.ready();

    const response = await server.inject({ method: "GET", url: "/protected" });
    expect(response.statusCode).toBe(401);
  });

  it("requireAdmin should block non-admin users", async () => {
    server.decorateRequest("user", null);
    server.addHook("onRequest", async (request: FastifyRequest) => {
      request.user = {
        id: "user-1",
        name: "Alice",
        email: "alice@example.com",
        emailVerified: true,
        role: "member",
        banned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies AuthUser;
    });
    server.get("/admin", { preHandler: requireAdmin }, async () => ({
      ok: true,
    }));
    await server.ready();

    const response = await server.inject({ method: "GET", url: "/admin" });
    expect(response.statusCode).toBe(403);
  });

  it("requireAdmin should allow admin users", async () => {
    server.decorateRequest("user", null);
    server.addHook("onRequest", async (request: FastifyRequest) => {
      request.user = {
        id: "admin-1",
        name: "Admin",
        email: "admin@example.com",
        emailVerified: true,
        role: "admin",
        banned: false,
        createdAt: new Date(),
        updatedAt: new Date(),
      } satisfies AuthUser;
    });
    server.get("/admin", { preHandler: requireAdmin }, async () => ({
      ok: true,
    }));
    await server.ready();

    const response = await server.inject({ method: "GET", url: "/admin" });
    expect(response.statusCode).toBe(200);
  });
});
