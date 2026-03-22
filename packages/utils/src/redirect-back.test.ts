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

  it("returns a relative Referer path directly", () => {
    const location = redirectBack(req({ referer: "/dashboard" }), {
      fallback: "/",
    });
    expect(location).toBe("/dashboard");
  });

  it("returns a relative Referer path with query and hash", () => {
    const location = redirectBack(req({ referer: "/search?q=hello#results" }), {
      fallback: "/",
    });
    expect(location).toBe("/search?q=hello#results");
  });

  it("strips the origin from an absolute HTTP Referer URL", () => {
    const location = redirectBack(
      req({ referer: "https://example.com/about?tab=info" }),
      { fallback: "/" },
    );
    expect(location).toBe("/about?tab=info");
  });

  it("strips the origin from an absolute HTTP URL with hash", () => {
    const location = redirectBack(
      req({ referer: "http://localhost:3000/page#section" }),
      { fallback: "/" },
    );
    expect(location).toBe("/page#section");
  });

  it("returns the fallback for a non-HTTP protocol Referer", () => {
    const location = redirectBack(
      req({ referer: "ftp://files.example.com/" }),
      {
        fallback: "/home",
      },
    );
    expect(location).toBe("/home");
  });

  it("returns the fallback for an invalid URL Referer", () => {
    const location = redirectBack(req({ referer: "not a valid url at all" }), {
      fallback: "/fallback",
    });
    expect(location).toBe("/fallback");
  });

  it("returns the fallback for a Referer with undefined value", () => {
    const location = redirectBack(req({ referer: undefined }), {
      fallback: "/default",
    });
    expect(location).toBe("/default");
  });

  it("handles an absolute URL Referer that resolves to just /", () => {
    const location = redirectBack(req({ referer: "https://example.com" }), {
      fallback: "/fallback",
    });
    expect(location).toBe("/");
  });

  it("returns the first element path when Referer is an array with valid URL", () => {
    const location = redirectBack(
      req({ referer: ["/first-path", "/second-path"] }),
      { fallback: "/" },
    );
    expect(location).toBe("/first-path");
  });
});
