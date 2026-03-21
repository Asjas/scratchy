import type { Auth, BetterAuthOptions } from "better-auth";
import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

const mockGetSession = vi.fn();

vi.mock("fastify-better-auth", () => {
  const plugin = vi.fn(async (fastify: Fastify.FastifyInstance) => {
    fastify.get("/api/auth/*", async (_req, reply) => {
      return reply.send({ ok: true });
    });
    fastify.post("/api/auth/*", async (_req, reply) => {
      return reply.send({ ok: true });
    });
  });
  return {
    default: plugin,
    getAuthDecorator: vi.fn(() => ({
      api: { getSession: mockGetSession },
    })),
  };
});

describe("auth plugin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  const mockAuth = {
    handler: vi.fn(),
    api: { getSession: mockGetSession },
    options: {},
    $ERROR_CODES: {},
    $context: Promise.resolve({}),
    $Infer: {},
  } as unknown as Auth<BetterAuthOptions>;

  it("should decorate request.user as null when no session", async () => {
    mockGetSession.mockResolvedValue(null);

    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, { auth: mockAuth });

    server.get("/test", async (request) => {
      return { user: request.user };
    });

    await server.ready();

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: null });

    await server.close();
  });

  it("should populate request.user from session", async () => {
    const mockUser = {
      id: "user-123",
      name: "Alice",
      email: "alice@example.com",
      emailVerified: true,
      role: "member",
      banned: false,
      createdAt: new Date("2025-01-01"),
      updatedAt: new Date("2025-01-01"),
    };

    mockGetSession.mockResolvedValue({ user: mockUser, session: {} });

    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, { auth: mockAuth });

    server.get("/test", async (request) => {
      return { userId: request.user?.id };
    });

    await server.ready();

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ userId: "user-123" });

    await server.close();
  });

  it("should set request.user to null when session has no user", async () => {
    mockGetSession.mockResolvedValue({ user: undefined });

    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, { auth: mockAuth });

    server.get("/test", async (request) => {
      return { user: request.user };
    });

    await server.ready();

    const response = await server.inject({ method: "GET", url: "/test" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ user: null });

    await server.close();
  });
});
