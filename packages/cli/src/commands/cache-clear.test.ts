import type { CommandMeta } from "citty";
import { rm } from "node:fs/promises";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

describe("cacheClearCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should remove all cache directories", async () => {
    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    expect(rm).toHaveBeenCalledTimes(4);
    expect(rm).toHaveBeenCalledWith("/tmp/test-project/dist", {
      recursive: true,
      force: true,
    });
    expect(rm).toHaveBeenCalledWith("/tmp/test-project/.qwik", {
      recursive: true,
      force: true,
    });
    expect(rm).toHaveBeenCalledWith("/tmp/test-project/node_modules/.vite", {
      recursive: true,
      force: true,
    });
    expect(rm).toHaveBeenCalledWith("/tmp/test-project/node_modules/.cache", {
      recursive: true,
      force: true,
    });
  });

  it("should handle errors gracefully and continue", async () => {
    vi.mocked(rm).mockRejectedValueOnce(new Error("ENOENT"));

    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    // Should not throw
    await run({
      args: { _: [], cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    // Should have tried all 4 directories despite the first failing
    expect(rm).toHaveBeenCalledTimes(4);
  });

  it("should handle non-Error exceptions gracefully", async () => {
    vi.mocked(rm).mockRejectedValueOnce("string error");

    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    // Should not throw
    await run({
      args: { _: [], cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    expect(rm).toHaveBeenCalledTimes(4);
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], cwd: "" },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    // Should use process.cwd() + /dist, etc.
    expect(rm).toHaveBeenCalledTimes(4);
  });

  it("should have correct command metadata", async () => {
    const { cacheClearCommand } = await import("./cache-clear.js");
    const meta = cacheClearCommand.meta as CommandMeta;
    expect(meta.name).toBe("cache:clear");
    expect(meta.description).toBe(
      "Remove build output and local cache directories",
    );
  });
});
