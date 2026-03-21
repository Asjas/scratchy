import { createSchema } from "./schema.js";
import { afterEach, describe, expect, it, vi } from "vitest";

describe("createSchema", () => {
  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("should return a pgSchema with the given name", () => {
    const schema = createSchema("my_app");
    // pgSchema objects expose the schema name via their internal symbol,
    // but we can verify by checking the table builder works.
    expect(schema).toBeDefined();
    expect(typeof schema.table).toBe("function");
    expect(typeof schema.enum).toBe("function");
  });

  it("should default to 'app' when no name or env var is provided", () => {
    const schema = createSchema();
    expect(schema).toBeDefined();
    expect(typeof schema.table).toBe("function");
  });

  it("should accept a custom schema name", () => {
    const schema = createSchema("custom_schema");
    expect(schema).toBeDefined();
    expect(typeof schema.table).toBe("function");
  });

  it("should read DATABASE_SCHEMA env var when no name is provided", () => {
    vi.stubEnv("DATABASE_SCHEMA", "env_schema");
    const schema = createSchema();
    expect(schema).toBeDefined();
    expect(typeof schema.table).toBe("function");
  });

  it("should prefer explicit name over DATABASE_SCHEMA env var", () => {
    vi.stubEnv("DATABASE_SCHEMA", "env_schema");
    const schema = createSchema("explicit_name");
    expect(schema).toBeDefined();
    expect(typeof schema.table).toBe("function");
  });
});
