import * as indexExports from "./index.js";
import { describe, expect, it } from "vitest";

describe("renderer/src/index re-exports", () => {
  it("re-exports wrapInShell", () => {
    expect(typeof indexExports.wrapInShell).toBe("function");
  });

  it("re-exports shared-buffer utilities", () => {
    expect(indexExports.BufferStatus).toBeDefined();
    expect(typeof indexExports.createSharedBuffer).toBe("function");
    expect(typeof indexExports.readFromBuffer).toBe("function");
    expect(typeof indexExports.writeToBuffer).toBe("function");
  });

  it("re-exports redis-comm utilities", () => {
    expect(typeof indexExports.cleanupRenderContext).toBe("function");
    expect(typeof indexExports.getRenderContext).toBe("function");
    expect(typeof indexExports.storeRenderContext).toBe("function");
    expect(typeof indexExports.storeRenderResult).toBe("function");
  });

  it("re-exports createSSRHandler", () => {
    expect(typeof indexExports.createSSRHandler).toBe("function");
  });

  it("re-exports createStreamingSSRHandler", () => {
    expect(typeof indexExports.createStreamingSSRHandler).toBe("function");
  });

  it("re-exports runSsgPipeline", () => {
    expect(typeof indexExports.runSsgPipeline).toBe("function");
  });
});
