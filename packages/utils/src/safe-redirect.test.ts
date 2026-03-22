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

  it("returns the default redirect for a percent-encoded '..' traversal (%2e%2e)", () => {
    expect(safeRedirect("/%2e%2e/etc/passwd")).toBe("/");
  });

  it("returns the default redirect for a mixed-case percent-encoded '..' (%2E%2E)", () => {
    expect(safeRedirect("/%2E%2E/etc/passwd")).toBe("/");
  });

  it("returns the default redirect for a percent-encoded protocol-relative URL (%2F%2F)", () => {
    expect(safeRedirect("%2F%2Fevil.com")).toBe("/");
  });

  it("returns the default redirect for malformed percent-encoding", () => {
    expect(safeRedirect("/%GG/path")).toBe("/");
  });

  it("returns the default redirect for percent-encoded CR/LF characters in the path", () => {
    expect(safeRedirect("/%0d%0aevil.com")).toBe("/");
  });
  it("accepts a safe path that contains percent-encoded characters (e.g. spaces)", () => {
    expect(safeRedirect("/my%20dashboard")).toBe("/my dashboard");
  });
});
