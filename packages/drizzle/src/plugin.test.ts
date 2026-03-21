import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";

// Mock pg and drizzle-orm/node-postgres before importing the plugin
vi.mock("pg", () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
    on: vi.fn().mockReturnThis(),
    end: vi.fn().mockResolvedValue(undefined),
  };

  return {
    default: { Pool: vi.fn(() => mockPool) },
    Pool: vi.fn(() => mockPool),
  };
});

vi.mock("drizzle-orm/node-postgres", () => ({
  drizzle: vi.fn(() => ({ query: {} })),
}));

describe("drizzle plugin", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should decorate fastify with db and pool", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      connectionString: "postgresql://localhost:5432/testdb",
    });

    await server.ready();

    expect(server.db).toBeDefined();
    expect(server.pool).toBeDefined();

    await server.close();
  });

  it("should end the pool on server close", async () => {
    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      connectionString: "postgresql://localhost:5432/testdb",
    });

    await server.ready();

    const pool = server.pool;
    const endSpy = vi.spyOn(pool, "end");

    await server.close();

    expect(endSpy).toHaveBeenCalledOnce();
  });
});
