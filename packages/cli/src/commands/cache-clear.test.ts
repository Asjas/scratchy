import { type VirtualFileSystem, create } from "@scratchyjs/vfs";
import type { CommandMeta } from "citty";
import { consola } from "consola";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MOUNT = `/tmp/vfs-cache-clear-${process.pid}`;

describe("cacheClearCommand", () => {
  let vfs: VirtualFileSystem;

  beforeEach(() => {
    vi.resetModules();
    vfs = create();
    vfs.mount(MOUNT);
    vfs.addDirectory(`${MOUNT}/dist`);
    vfs.addDirectory(`${MOUNT}/.qwik`);
    vfs.addDirectory(`${MOUNT}/node_modules/.vite`);
    vfs.addDirectory(`${MOUNT}/node_modules/.cache`);
  });

  afterEach(() => {
    vfs.unmount();
    vi.doUnmock("node:fs/promises");
    vi.restoreAllMocks();
  });

  it("should remove all cache directories", async () => {
    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], cwd: MOUNT },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    expect(vfs.existsSync(`${MOUNT}/dist`)).toBe(false);
    expect(vfs.existsSync(`${MOUNT}/.qwik`)).toBe(false);
    expect(vfs.existsSync(`${MOUNT}/node_modules/.vite`)).toBe(false);
    expect(vfs.existsSync(`${MOUNT}/node_modules/.cache`)).toBe(false);
  });

  it("should handle errors gracefully and continue", async () => {
    const rmMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValue(undefined);
    vi.doMock("node:fs/promises", () => ({ rm: rmMock }));

    const warnSpy = vi
      .spyOn(consola, "warn")
      .mockImplementation(() => undefined);
    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], cwd: MOUNT },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    expect(rmMock).toHaveBeenCalledTimes(4);
    expect(warnSpy).toHaveBeenCalledWith("Skipped dist: ENOENT");
  });

  it("should handle non-Error exceptions gracefully", async () => {
    const rmMock = vi
      .fn()
      .mockRejectedValueOnce("string error")
      .mockResolvedValue(undefined);
    vi.doMock("node:fs/promises", () => ({ rm: rmMock }));

    const warnSpy = vi
      .spyOn(consola, "warn")
      .mockImplementation(() => undefined);
    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], cwd: MOUNT },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    expect(rmMock).toHaveBeenCalledTimes(4);
    expect(warnSpy).toHaveBeenCalledWith("Skipped dist: string error");
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const rmMock = vi.fn().mockResolvedValue(undefined);
    vi.doMock("node:fs/promises", () => ({ rm: rmMock }));

    const { cacheClearCommand } = await import("./cache-clear.js");
    const run = cacheClearCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], cwd: "" },
      rawArgs: [],
      cmd: cacheClearCommand,
    });

    expect(rmMock).toHaveBeenCalledTimes(4);
    expect(rmMock).toHaveBeenCalledWith(
      expect.stringContaining(process.cwd()),
      expect.objectContaining({ recursive: true }),
    );
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
