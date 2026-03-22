import { createServer, loadConfig } from "@scratchyjs/core";
import { createSSRHandler } from "@scratchyjs/renderer";
import type {} from "@scratchyjs/renderer/plugin";
import { publicProcedure, router } from "@scratchyjs/trpc";
import type { FastifyInstance } from "fastify";
import { resolve } from "node:path";
import superjson from "superjson";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { z } from "zod";

// ── In-memory test data ─────────────────────────────────────────────────────
interface PostRecord {
  id: string;
  title: string;
  content: string;
}

const postsStore: PostRecord[] = [
  { id: "post-1", title: "Hello World", content: "First post content." },
];
let nextId = 2;

// ── In-memory tRPC router (no real DB required) ──────────────────────────────
const testPostsRouter = router({
  list: publicProcedure.query(() => postsStore),

  getById: publicProcedure
    .input(z.object({ id: z.string() }))
    .query(({ input }) => {
      const found = postsStore.find((p) => p.id === input.id);
      if (!found) throw new Error("Post not found");
      return found;
    }),

  create: publicProcedure
    .input(z.object({ title: z.string(), content: z.string() }))
    .mutation(({ input }) => {
      const newPost: PostRecord = {
        id: `post-${nextId++}`,
        ...input,
      };
      postsStore.push(newPost);
      return newPost;
    }),

  delete: publicProcedure
    .input(z.object({ id: z.string() }))
    .mutation(({ input }) => {
      const idx = postsStore.findIndex((p) => p.id === input.id);
      if (idx !== -1) postsStore.splice(idx, 1);
      return { success: true };
    }),
});

const testAppRouter = router({ posts: testPostsRouter });

// ── Server setup ─────────────────────────────────────────────────────────────
let server: FastifyInstance;

beforeAll(async () => {
  const config = loadConfig({ LOG_LEVEL: "silent" });
  server = await createServer(config);

  // Register tRPC with the in-memory test router
  const { default: trpcPlugin } = await import("@scratchyjs/trpc/plugin");
  await server.register(trpcPlugin, { router: testAppRouter });

  // Register the auth plugin with an in-memory Better Auth instance.
  // No database adapter is configured here intentionally — this keeps
  // the tests self-contained and dependency-free. Without an adapter,
  // sign-up/sign-in flows will fail at the storage layer, but the routes
  // are still mounted and reachable (no 404), which is what the auth
  // endpoint reachability tests below verify.
  const { createAuth } = await import("@scratchyjs/auth");
  const { default: authPlugin } = await import("@scratchyjs/auth/plugin");
  const auth = createAuth({
    basePath: "/api/auth",
    secret: "test-secret-at-least-32-characters-long",
    emailAndPassword: { enabled: true },
  });
  await server.register(authPlugin, { auth });

  // Register a protected test route using requireAuth
  const { requireAuth } = await import("@scratchyjs/auth/hooks");
  server.get("/protected", { preHandler: requireAuth }, (request) => {
    return { user: request.user };
  });

  // Register the renderer worker pool
  const { default: rendererPlugin } =
    await import("@scratchyjs/renderer/plugin");
  const workerPath = resolve(import.meta.dirname, "renderer", "worker.ts");
  await server.register(rendererPlugin, {
    worker: workerPath,
    minThreads: 1,
    maxThreads: 2,
    taskTimeout: 10_000,
  });

  // SSR catch-all route
  server.get("/", createSSRHandler());

  await server.ready();
});

afterAll(async () => {
  await server.close();
});

// ── Health check ─────────────────────────────────────────────────────────────
describe("health check", () => {
  it("GET /health returns 200 with status ok", async () => {
    const response = await server.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ status: string; timestamp: string }>();
    expect(body.status).toBe("ok");
    expect(typeof body.timestamp).toBe("string");
    expect(() => new Date(body.timestamp)).not.toThrow();
  });
});

// ── tRPC queries and mutations ────────────────────────────────────────────────
describe("tRPC", () => {
  it("posts.list returns the in-memory posts array", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/trpc/posts.list",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ result: { data: { json: PostRecord[] } } }>();
    expect(Array.isArray(body.result.data.json)).toBe(true);
    expect(body.result.data.json.length).toBeGreaterThan(0);
    expect(body.result.data.json[0]).toMatchObject({
      id: "post-1",
      title: "Hello World",
    });
  });

  it("posts.create mutation creates a new post", async () => {
    const payload = superjson.serialize({
      title: "Integration Test Post",
      content: "Created during integration test.",
    });

    const response = await server.inject({
      method: "POST",
      url: "/trpc/posts.create",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify(payload),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{
      result: { data: { json: PostRecord } };
    }>();
    const created = body.result.data.json;
    expect(created.title).toBe("Integration Test Post");
    expect(typeof created.id).toBe("string");
  });

  it("posts.getById returns a specific post", async () => {
    const encodedInput = encodeURIComponent(
      JSON.stringify(superjson.serialize({ id: "post-1" })),
    );
    const response = await server.inject({
      method: "GET",
      url: `/trpc/posts.getById?input=${encodedInput}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json<{ result: { data: { json: PostRecord } } }>();
    expect(body.result.data.json.id).toBe("post-1");
  });

  it("tRPC responses include cache-control: no-store header", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/trpc/posts.list",
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["cache-control"]).toBe(
      "no-store, no-cache, must-revalidate, private",
    );
  });
});

// ── CORS ──────────────────────────────────────────────────────────────────────
describe("CORS", () => {
  it("responds with Access-Control-Allow-Origin when Origin header is present", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/health",
      headers: { origin: "https://example.com" },
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["access-control-allow-origin"]).toBe(
      "https://example.com",
    );
  });

  it("handles CORS preflight OPTIONS requests", async () => {
    const response = await server.inject({
      method: "OPTIONS",
      url: "/health",
      headers: {
        "origin": "https://example.com",
        "access-control-request-method": "GET",
      },
    });

    expect(response.statusCode).toBe(204);
    expect(response.headers["access-control-allow-methods"]).toBeDefined();
  });
});

// ── SSR via worker pool ───────────────────────────────────────────────────────
describe("SSR worker pool", () => {
  it("GET / returns server-rendered HTML via the worker pool", async () => {
    const response = await server.inject({ method: "GET", url: "/" });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("text/html");
    expect(response.body).toContain("<!DOCTYPE html>");
    expect(response.body).toContain('<div id="app"');
  });

  it("worker pool decorators are registered on the server", () => {
    expect(server.piscina).toBeDefined();
    expect(typeof server.runTask).toBe("function");
  });
});

// ── Auth plugin ───────────────────────────────────────────────────────────────
describe("auth plugin", () => {
  it("blocks unauthenticated requests to /protected with 401", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/protected",
    });

    // Verify that unauthenticated access to /protected is rejected with 401
    expect(response.statusCode).toBe(401);
    expect(response.json()).toMatchObject({
      error: "Unauthorized",
    });
  });

  it("GET /api/auth/get-session returns null session when unauthenticated", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/api/auth/get-session",
    });

    // Better Auth returns 200 with null when there is no session
    expect(response.statusCode).toBe(200);
    const body = response.json<null>();
    expect(body).toBeNull();
  });

  it("POST /api/auth/sign-up/email endpoint is reachable", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/auth/sign-up/email",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        name: "Test User",
        email: "test@example.com",
        password: "password123456",
      }),
    });

    // Without a database adapter the request fails, but the route is mounted
    // and Better Auth handles the request (not a 404).
    expect(response.statusCode).not.toBe(404);
  });

  it("POST /api/auth/sign-in/email endpoint is reachable", async () => {
    const response = await server.inject({
      method: "POST",
      url: "/api/auth/sign-in/email",
      headers: { "content-type": "application/json" },
      payload: JSON.stringify({
        email: "test@example.com",
        password: "password123456",
      }),
    });

    // Without a database adapter the request fails, but the route is mounted
    // and Better Auth handles the request (not a 404).
    expect(response.statusCode).not.toBe(404);
  });
});
