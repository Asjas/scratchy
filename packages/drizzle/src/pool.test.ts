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

  it("should execute the connect handler and set keepalive on stream", async () => {
    await createPool("postgresql://localhost:5432/testdb");

    // Extract the connect handler
    const connectCall = mockPoolInstance.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) =>
        call[0] === "connect",
    );
    const connectHandler = connectCall?.[1] as (client: unknown) => void;

    const mockStream = { setKeepAlive: vi.fn() };
    const mockClient = {
      connection: { stream: mockStream },
      on: vi.fn(),
    };

    connectHandler(mockClient);

    expect(mockStream.setKeepAlive).toHaveBeenCalledWith(true, 10_000);
    expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("should handle connect handler when stream is missing", async () => {
    await createPool("postgresql://localhost:5432/testdb");

    const connectCall = mockPoolInstance.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) =>
        call[0] === "connect",
    );
    const connectHandler = connectCall?.[1] as (client: unknown) => void;

    const mockClient = {
      connection: {},
      on: vi.fn(),
    };

    // Should not throw when stream is missing
    connectHandler(mockClient);
    expect(mockClient.on).toHaveBeenCalledWith("error", expect.any(Function));
  });

  it("should log client errors through the logger", async () => {
    const logger = { error: vi.fn() };
    await createPool("postgresql://localhost:5432/testdb", {}, logger);

    // Extract the connect handler
    const connectCall = mockPoolInstance.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) =>
        call[0] === "connect",
    );
    const connectHandler = connectCall?.[1] as (client: unknown) => void;

    const mockClient = {
      on: vi.fn(),
    };
    connectHandler(mockClient);

    // Extract the client error handler
    const clientErrorHandler = mockClient.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "error",
    )?.[1] as (err: Error) => void;

    const testError = new Error("connection lost");
    clientErrorHandler(testError);

    expect(logger.error).toHaveBeenCalledWith(
      "Database client error: connection lost",
    );
  });

  it("should log pool-level errors through the logger", async () => {
    const logger = { error: vi.fn() };
    await createPool("postgresql://localhost:5432/testdb", {}, logger);

    // Extract the pool error handler
    const errorCall = mockPoolInstance.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "error",
    );
    const errorHandler = errorCall?.[1] as (err: Error) => void;

    const testError = new Error("pool error");
    errorHandler(testError);

    expect(logger.error).toHaveBeenCalledWith(
      "Unexpected database pool error: pool error",
    );
  });

  it("should not log errors when no logger is provided", async () => {
    await createPool("postgresql://localhost:5432/testdb");

    // Extract the pool error handler
    const errorCall = mockPoolInstance.on.mock.calls.find(
      (call: [string, (...args: unknown[]) => unknown]) => call[0] === "error",
    );
    const errorHandler = errorCall?.[1] as (err: Error) => void;

    // Should not throw when logger is undefined
    errorHandler(new Error("pool error without logger"));
  });

  it("should throw and end pool when startup SELECT 1 fails", async () => {
    const queryError = new Error("connection refused");
    mockPoolInstance.query.mockRejectedValueOnce(queryError);

    await expect(
      createPool("postgresql://localhost:5432/testdb"),
    ).rejects.toThrow("connection refused");

    expect(mockPoolInstance.end).toHaveBeenCalledOnce();
  });

  it("should propagate original error even if pool.end fails during startup", async () => {
    const queryError = new Error("connection refused");
    mockPoolInstance.query.mockRejectedValueOnce(queryError);
    mockPoolInstance.end.mockRejectedValueOnce(new Error("end failed"));

    await expect(
      createPool("postgresql://localhost:5432/testdb"),
    ).rejects.toThrow("connection refused");
  });
});
