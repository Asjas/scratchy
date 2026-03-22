import { getClientLocales } from "./locales.js";
import { describe, expect, it } from "vitest";

function req(headers: Record<string, string | string[] | undefined>) {
  return { headers };
}

describe("getClientLocales", () => {
  it("returns undefined when the accept-language header is absent", () => {
    expect(getClientLocales(req({}))).toBeUndefined();
  });

  it("returns the locale when there is only one", () => {
    const locales = getClientLocales(req({ "accept-language": "en-US" }));
    expect(locales).toEqual(["en-US"]);
  });

  it("returns locales sorted by quality value (highest first)", () => {
    const locales = getClientLocales(
      req({ "accept-language": "fr-FR;q=0.8, en-US;q=0.9, de;q=0.7" }),
    );
    // en-US (0.9) > fr-FR (0.8) > de (0.7)
    expect(locales).toBeDefined();
    expect(locales).toHaveLength(3);
    expect(locales?.[0]).toBe("en-US");
    expect(locales?.[1]).toBe("fr-FR");
  });

  it("ignores wildcard (*) entries", () => {
    const locales = getClientLocales(
      req({ "accept-language": "en-US, *;q=0.1" }),
    );
    expect(locales).not.toContain("*");
    expect(locales).toContain("en-US");
  });

  it("returns undefined when only unsupported locales are present", () => {
    const locales = getClientLocales(req({ "accept-language": "xx-INVALID" }));
    expect(locales).toBeUndefined();
  });

  it("handles quality value of 1 (implicit default)", () => {
    const locales = getClientLocales(
      req({ "accept-language": "en-GB, fr;q=0.5" }),
    );
    expect(locales).toBeDefined();
    expect(locales?.[0]).toBe("en-GB");
  });

  it("handles a comma-separated string with multiple locales", () => {
    const locales = getClientLocales(
      req({ "accept-language": "en-US,en;q=0.9,fr;q=0.8" }),
    );
    expect(locales).toBeDefined();
    expect(locales?.length).toBeGreaterThanOrEqual(2);
    expect(locales?.[0]).toBe("en-US");
  });

  it("handles array-type accept-language header", () => {
    const locales = getClientLocales(
      req({ "accept-language": ["en-US", "fr-FR;q=0.8"] }),
    );
    expect(locales).toBeDefined();
    expect(locales).toContain("en-US");
  });

  it("filters out entries with quality <= 0", () => {
    const locales = getClientLocales(
      req({ "accept-language": "en-US;q=0, fr-FR" }),
    );
    expect(locales).toBeDefined();
    expect(locales).not.toContain("en-US");
    expect(locales).toContain("fr-FR");
  });

  it("filters out entries with quality > 1", () => {
    const locales = getClientLocales(
      req({ "accept-language": "en-US;q=1.5, fr-FR" }),
    );
    expect(locales).toBeDefined();
    expect(locales).not.toContain("en-US");
    expect(locales).toContain("fr-FR");
  });

  it("filters out entries with non-numeric quality", () => {
    const locales = getClientLocales(
      req({ "accept-language": "en-US;q=abc, fr-FR" }),
    );
    expect(locales).toBeDefined();
    expect(locales).not.toContain("en-US");
    expect(locales).toContain("fr-FR");
  });

  it("returns undefined for empty accept-language header", () => {
    expect(getClientLocales(req({ "accept-language": "" }))).toBeUndefined();
  });
});
