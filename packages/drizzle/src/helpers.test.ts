import { timestamps } from "./helpers.js";
import { describe, expect, it } from "vitest";

/** Helper to extract the internal config from a Drizzle column builder. */
function getConfig(col: object): Record<string, unknown> {
  return (col as unknown as { config: Record<string, unknown> }).config;
}

describe("timestamps", () => {
  it("should have createdAt and updatedAt columns", () => {
    expect(timestamps).toHaveProperty("createdAt");
    expect(timestamps).toHaveProperty("updatedAt");
  });

  it("should have createdAt configured as not-null with default", () => {
    const config = getConfig(timestamps.createdAt);
    expect(config.notNull).toBe(true);
    expect(config.hasDefault).toBe(true);
  });

  it("should have updatedAt configured as not-null with default and $onUpdate", () => {
    const config = getConfig(timestamps.updatedAt);
    expect(config.notNull).toBe(true);
    expect(config.hasDefault).toBe(true);
    expect(typeof timestamps.updatedAt.$onUpdate).toBe("function");
  });

  it("should define exactly two columns", () => {
    expect(Object.keys(timestamps)).toEqual(["createdAt", "updatedAt"]);
  });

  it("should use withTimezone on both columns", () => {
    expect(getConfig(timestamps.createdAt).withTimezone).toBe(true);
    expect(getConfig(timestamps.updatedAt).withTimezone).toBe(true);
  });

  it("$onUpdateFn callback returns a Date", () => {
    const config = getConfig(timestamps.updatedAt);
    const fn = config.onUpdateFn as (() => Date) | undefined;
    if (!fn)
      throw new Error("Expected onUpdateFn to be defined on updatedAt config");
    const result = fn();
    expect(result).toBeInstanceOf(Date);
  });
});
