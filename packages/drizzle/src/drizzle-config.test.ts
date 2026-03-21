import { createDrizzleConfig } from "./drizzle-config.js";
import { describe, expect, it } from "vitest";

describe("createDrizzleConfig", () => {
  it("should return a config with postgresql dialect", () => {
    const config = createDrizzleConfig({
      schema: "./src/db/schema",
      connectionString: "postgresql://localhost:5432/testdb",
    });

    expect(config.dialect).toBe("postgresql");
  });

  it("should enforce snake_case casing", () => {
    const config = createDrizzleConfig({
      schema: "./src/db/schema",
      connectionString: "postgresql://localhost:5432/testdb",
    });

    expect(config.casing).toBe("snake_case");
  });

  it("should default output directory to ./drizzle", () => {
    const config = createDrizzleConfig({
      schema: "./src/db/schema",
      connectionString: "postgresql://localhost:5432/testdb",
    });

    expect(config.out).toBe("./drizzle");
  });

  it("should accept a custom output directory", () => {
    const config = createDrizzleConfig({
      schema: "./src/db/schema",
      connectionString: "postgresql://localhost:5432/testdb",
      out: "./migrations",
    });

    expect(config.out).toBe("./migrations");
  });

  it("should accept an array of schema paths", () => {
    const config = createDrizzleConfig({
      schema: ["./src/db/my-schema.ts", "./src/db/schema"],
      connectionString: "postgresql://localhost:5432/testdb",
    });

    expect(config.schema).toEqual(["./src/db/my-schema.ts", "./src/db/schema"]);
  });

  it("should set the connection URL in dbCredentials", () => {
    const config = createDrizzleConfig({
      schema: "./src/db/schema",
      connectionString: "postgresql://user:pass@host:5432/mydb",
    });

    expect(config.dbCredentials).toEqual({
      url: "postgresql://user:pass@host:5432/mydb",
    });
  });
});
