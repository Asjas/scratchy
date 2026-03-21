import { createPool } from "./pool.js";
import type { PoolOptions } from "./pool.js";
import pg from "pg";
import { afterEach, describe, expect, it, vi } from "vitest";

const { Pool } = pg;

const mockPoolInstance = {
  query: vi.fn().mockResolvedValue({ rows: [{ "?column?": 1 }] }),
  on: vi.fn().mockReturnThis(),
  end: vi.fn().mockResolvedValue(undefined),
};

// Mock the pg module to avoid needing a real database
vi.mock("pg", () => {
  const MockPool = vi.fn(() => mockPoolInstance);
  return {
    default: { Pool: MockPool },
    Pool: MockPool,
  };
});

describe("createPool", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should create a pool and verify connection with SELECT 1", async () => {
    const pool = await createPool("postgresql://localhost:5432/testdb");
    expect(pool).toBeDefined();
    expect(Pool).toHaveBeenCalledOnce();
    expect(mockPoolInstance.query).toHaveBeenCalledWith("SELECT 1");
  });

  it("should append keepalive parameters to the connection URL", async () => {
    await createPool("postgresql://localhost:5432/testdb");

    const callArgs = vi.mocked(Pool).mock.calls[0]?.[0] as {
      connectionString: string;
    };
    expect(callArgs.connectionString).toContain("keepalives=1");
    expect(callArgs.connectionString).toContain("keepalives_idle=300");
    expect(callArgs.connectionString).toContain("keepalives_interval=10");
    expect(callArgs.connectionString).toContain("keepalives_count=10");
  });

  it("should use & separator when URL already has query params", async () => {
    await createPool("postgresql://localhost:5432/testdb?sslmode=require");

    const callArgs = vi.mocked(Pool).mock.calls[0]?.[0] as {
      connectionString: string;
    };
    expect(callArgs.connectionString).toContain(
      "?sslmode=require&keepalives=1",
    );
  });

  it("should apply default pool options", async () => {
    await createPool("postgresql://localhost:5432/testdb");

    const callArgs = vi.mocked(Pool).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(callArgs.max).toBe(100);
    expect(callArgs.min).toBe(10);
    expect(callArgs.idleTimeoutMillis).toBe(30_000);
    expect(callArgs.connectionTimeoutMillis).toBe(10_000);
    expect(callArgs.keepAlive).toBe(true);
  });

  it("should allow overriding pool options", async () => {
    const options: PoolOptions = {
      max: 50,
      min: 5,
      idleTimeoutMillis: 60_000,
    };

    await createPool("postgresql://localhost:5432/testdb", options);

    const callArgs = vi.mocked(Pool).mock.calls[0]?.[0] as Record<
      string,
      unknown
    >;
    expect(callArgs.max).toBe(50);
    expect(callArgs.min).toBe(5);
    expect(callArgs.idleTimeoutMillis).toBe(60_000);
    // Defaults should still apply for non-overridden options
    expect(callArgs.connectionTimeoutMillis).toBe(10_000);
  });

  it("should register connect and error event handlers on the pool", async () => {
    await createPool("postgresql://localhost:5432/testdb");

    expect(mockPoolInstance.on).toHaveBeenCalledWith(
      "connect",
      expect.any(Function),
    );
    expect(mockPoolInstance.on).toHaveBeenCalledWith(
      "error",
      expect.any(Function),
    );
  });
});
