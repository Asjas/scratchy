import {
  FetchDestValues,
  FetchModeValues,
  FetchSiteValues,
  fetchDest,
  fetchMode,
  fetchSite,
  isUserInitiated,
} from "./sec-fetch.js";
import { describe, expect, it } from "vitest";

function req(headers: Record<string, string | string[] | undefined>) {
  return { headers };
}

describe("fetchDest", () => {
  it("returns null when the header is absent", () => {
    expect(fetchDest(req({}))).toBeNull();
  });

  it.each(FetchDestValues)("returns '%s' for a valid value", (value) => {
    expect(fetchDest(req({ "sec-fetch-dest": value }))).toBe(value);
  });

  it("returns null for an unrecognised value", () => {
    expect(fetchDest(req({ "sec-fetch-dest": "unknown" }))).toBeNull();
  });

  it("returns 'document' for a full-page navigation", () => {
    expect(fetchDest(req({ "sec-fetch-dest": "document" }))).toBe("document");
  });

  it("returns 'empty' for a fetch() call", () => {
    expect(fetchDest(req({ "sec-fetch-dest": "empty" }))).toBe("empty");
  });
});

describe("fetchMode", () => {
  it("returns null when the header is absent", () => {
    expect(fetchMode(req({}))).toBeNull();
  });

  it.each(FetchModeValues)("returns '%s' for a valid value", (value) => {
    expect(fetchMode(req({ "sec-fetch-mode": value }))).toBe(value);
  });

  it("returns null for an unrecognised value", () => {
    expect(fetchMode(req({ "sec-fetch-mode": "unknown" }))).toBeNull();
  });
});

describe("fetchSite", () => {
  it("returns null when the header is absent", () => {
    expect(fetchSite(req({}))).toBeNull();
  });

  it.each(FetchSiteValues)("returns '%s' for a valid value", (value) => {
    expect(fetchSite(req({ "sec-fetch-site": value }))).toBe(value);
  });

  it("returns null for an unrecognised value", () => {
    expect(fetchSite(req({ "sec-fetch-site": "unknown" }))).toBeNull();
  });
});

describe("isUserInitiated", () => {
  it("returns false when the Sec-Fetch-User header is absent", () => {
    expect(isUserInitiated(req({}))).toBe(false);
  });

  it("returns true when Sec-Fetch-User is '?1'", () => {
    expect(isUserInitiated(req({ "sec-fetch-user": "?1" }))).toBe(true);
  });

  it("returns false when Sec-Fetch-User is '?0'", () => {
    expect(isUserInitiated(req({ "sec-fetch-user": "?0" }))).toBe(false);
  });

  it("returns false for other values", () => {
    expect(isUserInitiated(req({ "sec-fetch-user": "true" }))).toBe(false);
  });
});
