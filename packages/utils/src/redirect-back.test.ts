import { redirectBack } from "./redirect-back.js";
import { describe, expect, it } from "vitest";

function req(headers: Record<string, string | string[] | undefined>) {
  return { headers };
}

describe("redirectBack", () => {
  it("returns the Referer header when present", () => {
    const location = redirectBack(
      req({ referer: "https://example.com/page" }),
      { fallback: "/" },
    );
    expect(location).toBe("/page");
  });

  it("returns the fallback when Referer header is absent", () => {
    const location = redirectBack(req({}), { fallback: "/dashboard" });
    expect(location).toBe("/dashboard");
  });

  it("returns the fallback when Referer is an empty string", () => {
    const location = redirectBack(req({ referer: "" }), { fallback: "/home" });
    expect(location).toBe("/home");
  });

  it("returns the first element when Referer is an array", () => {
    const location = redirectBack(
      req({ referer: ["https://first.com", "https://second.com"] }),
      { fallback: "/" },
    );
    expect(location).toBe("/");
  });

  it("handles various fallback paths", () => {
    expect(redirectBack(req({}), { fallback: "/search" })).toBe("/search");
    expect(redirectBack(req({}), { fallback: "/" })).toBe("/");
    expect(redirectBack(req({}), { fallback: "/deep/nested/path" })).toBe(
      "/deep/nested/path",
    );
  });
});
