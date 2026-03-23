import * as indexExports from "./index.js";
import { describe, expect, it } from "vitest";

describe("utils/src/index re-exports", () => {
  it("re-exports promiseHash, timeout, TimeoutError", () => {
    expect(typeof indexExports.promiseHash).toBe("function");
    expect(typeof indexExports.timeout).toBe("function");
    expect(indexExports.TimeoutError).toBeDefined();
  });

  it("re-exports interval", () => {
    expect(typeof indexExports.interval).toBe("function");
  });

  it("re-exports getClientIPAddress", () => {
    expect(typeof indexExports.getClientIPAddress).toBe("function");
  });

  it("re-exports getClientLocales", () => {
    expect(typeof indexExports.getClientLocales).toBe("function");
  });

  it("re-exports isPrefetch", () => {
    expect(typeof indexExports.isPrefetch).toBe("function");
  });

  it("re-exports safeRedirect", () => {
    expect(typeof indexExports.safeRedirect).toBe("function");
  });

  it("re-exports response helpers", () => {
    expect(typeof indexExports.notModified).toBe("function");
    expect(typeof indexExports.javascript).toBe("function");
    expect(typeof indexExports.stylesheet).toBe("function");
    expect(typeof indexExports.pdf).toBe("function");
    expect(typeof indexExports.html).toBe("function");
    expect(typeof indexExports.xml).toBe("function");
    expect(typeof indexExports.txt).toBe("function");
    expect(typeof indexExports.image).toBe("function");
  });

  it("re-exports sec-fetch helpers", () => {
    expect(typeof indexExports.fetchDest).toBe("function");
    expect(typeof indexExports.fetchMode).toBe("function");
    expect(typeof indexExports.fetchSite).toBe("function");
    expect(typeof indexExports.isUserInitiated).toBe("function");
    expect(indexExports.FetchDestValues).toBeDefined();
    expect(indexExports.FetchModeValues).toBeDefined();
    expect(indexExports.FetchSiteValues).toBeDefined();
  });

  it("re-exports redirectBack", () => {
    expect(typeof indexExports.redirectBack).toBe("function");
  });
});
