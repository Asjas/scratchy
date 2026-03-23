/**
 * Benchmarks for safeRedirect — the open-redirect guard used throughout
 * Scratchy whenever a redirect destination comes from user-supplied input.
 *
 * The suite covers the main hot paths: valid relative paths (happy path),
 * various rejection patterns (protocol-relative, absolute, path-traversal),
 * and percent-encoded bypass attempts.
 */
import { safeRedirect } from "../../packages/utils/src/safe-redirect.js";
import { bench, describe } from "vitest";

// ---------------------------------------------------------------------------
// Happy path — valid relative paths
// ---------------------------------------------------------------------------

describe("safeRedirect – valid paths", () => {
  bench("root path /", () => {
    safeRedirect("/");
  });

  bench("simple path /dashboard", () => {
    safeRedirect("/dashboard");
  });

  bench("nested path /settings/profile", () => {
    safeRedirect("/settings/profile");
  });

  bench("path with query string /search?q=hello", () => {
    safeRedirect("/search?q=hello");
  });

  bench("path with hash /docs#section", () => {
    safeRedirect("/docs#section");
  });
});

// ---------------------------------------------------------------------------
// Rejection paths — must return the default redirect
// ---------------------------------------------------------------------------

describe("safeRedirect – rejected inputs", () => {
  bench("absolute URL https://evil.com", () => {
    safeRedirect("https://evil.com");
  });

  bench("protocol-relative URL //evil.com", () => {
    safeRedirect("//evil.com");
  });

  bench("backslash-relative /\\evil.com", () => {
    safeRedirect("/\\evil.com");
  });

  bench("path traversal /../etc/passwd", () => {
    safeRedirect("/../etc/passwd");
  });

  bench("null input", () => {
    safeRedirect(null);
  });

  bench("undefined input", () => {
    safeRedirect(undefined);
  });

  bench("empty string", () => {
    safeRedirect("");
  });
});

// ---------------------------------------------------------------------------
// Percent-encoded bypass attempts
// ---------------------------------------------------------------------------

describe("safeRedirect – percent-encoded bypass", () => {
  bench("percent-encoded // (%2F%2F)", () => {
    safeRedirect("%2F%2Fevil.com");
  });

  bench("percent-encoded path traversal (%2e%2e)", () => {
    safeRedirect("%2e%2e/etc/passwd");
  });

  bench("mixed percent-encoded absolute URL", () => {
    safeRedirect("https%3A%2F%2Fevil.com");
  });
});

// ---------------------------------------------------------------------------
// Custom default redirect
// ---------------------------------------------------------------------------

describe("safeRedirect – custom default redirect", () => {
  bench("valid path with custom default", () => {
    safeRedirect("/settings", "/home");
  });

  bench("invalid input with custom default", () => {
    safeRedirect("https://evil.com", "/home");
  });
});
