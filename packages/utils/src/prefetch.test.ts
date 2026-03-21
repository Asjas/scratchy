import { isPrefetch } from "./prefetch.js";
import { describe, expect, it } from "vitest";

function req(headers: Record<string, string | string[] | undefined>) {
  return { headers };
}

describe("isPrefetch", () => {
  it("returns false when no prefetch headers are present", () => {
    expect(isPrefetch(req({}))).toBe(false);
  });

  it("returns true when Purpose header is 'prefetch'", () => {
    expect(isPrefetch(req({ purpose: "prefetch" }))).toBe(true);
  });

  it("is case-insensitive on the header value", () => {
    expect(isPrefetch(req({ purpose: "Prefetch" }))).toBe(true);
    expect(isPrefetch(req({ purpose: "PREFETCH" }))).toBe(true);
  });

  it("returns true for X-Purpose: prefetch", () => {
    expect(isPrefetch(req({ "x-purpose": "prefetch" }))).toBe(true);
  });

  it("returns true for Sec-Purpose: prefetch", () => {
    expect(isPrefetch(req({ "sec-purpose": "prefetch" }))).toBe(true);
  });

  it("returns true for Sec-Fetch-Purpose: prefetch", () => {
    expect(isPrefetch(req({ "sec-fetch-purpose": "prefetch" }))).toBe(true);
  });

  it("returns true for Moz-Purpose: prefetch", () => {
    expect(isPrefetch(req({ "moz-purpose": "prefetch" }))).toBe(true);
  });

  it("returns true for X-Moz: prefetch", () => {
    expect(isPrefetch(req({ "x-moz": "prefetch" }))).toBe(true);
  });

  it("returns false when purpose is not 'prefetch'", () => {
    expect(isPrefetch(req({ purpose: "navigate" }))).toBe(false);
  });

  it("handles an array value by using the first element", () => {
    expect(isPrefetch(req({ purpose: ["prefetch", "other"] }))).toBe(true);
    expect(isPrefetch(req({ purpose: ["navigate", "prefetch"] }))).toBe(false);
  });
});
