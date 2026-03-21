import { safeRedirect } from "./safe-redirect.js";
import { describe, expect, it } from "vitest";

describe("safeRedirect", () => {
  it("returns the path when it is safe", () => {
    expect(safeRedirect("/dashboard")).toBe("/dashboard");
  });

  it("returns the path with query string", () => {
    expect(safeRedirect("/search?q=test")).toBe("/search?q=test");
  });

  it("returns the path with hash", () => {
    expect(safeRedirect("/page#section")).toBe("/page#section");
  });

  it("returns the default redirect for an external URL", () => {
    expect(safeRedirect("https://malicious.example.com")).toBe("/");
  });

  it("returns the default redirect for a protocol-relative URL (//)", () => {
    expect(safeRedirect("//evil.com")).toBe("/");
  });

  it("returns the default redirect for a backslash protocol-relative URL", () => {
    expect(safeRedirect("/\\evil.com")).toBe("/");
  });

  it("returns the default redirect for a path containing '..'", () => {
    expect(safeRedirect("/../../etc/passwd")).toBe("/");
  });

  it("returns the default redirect for null", () => {
    expect(safeRedirect(null)).toBe("/");
  });

  it("returns the default redirect for undefined", () => {
    expect(safeRedirect(undefined)).toBe("/");
  });

  it("returns the default redirect for an empty string", () => {
    expect(safeRedirect("")).toBe("/");
  });

  it("uses a custom default redirect", () => {
    expect(safeRedirect("https://evil.com", "/home")).toBe("/home");
  });

  it("trims leading/trailing whitespace before evaluating safety", () => {
    expect(safeRedirect("  /dashboard  ")).toBe("/dashboard");
  });

  it("returns the default redirect for whitespace-only input", () => {
    expect(safeRedirect("   ")).toBe("/");
  });

  it("accepts FormDataEntryValue (File objects fail the typeof check)", () => {
    // File is a FormDataEntryValue but not a string — should fall back
    const file = new File(["content"], "test.txt");
    expect(safeRedirect(file)).toBe("/");
  });
});
