import { type VirtualFileSystem, create } from "@scratchyjs/vfs";
import type { CommandMeta } from "citty";
import { consola } from "consola";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * `node:child_process` is kept as a hoisted static mock (vi.mock) so that
 * spawnSync never actually executes a child process.
 *
 * `node:fs` is replaced via vi.doMock so that each test can mount a fresh VFS
 * instance and have `readdirSync` read from in-memory virtual files.  Each
 * test gets a unique CWD under MOUNT to avoid state leaking between tests.
 */
vi.mock("node:child_process", () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}));

const _require = createRequire(import.meta.url);
const MOUNT = `/tmp/vfs-db-seed-${process.pid}`;

describe("dbSeedCommand", () => {
  let vfs: VirtualFileSystem;
  let testIndex = 0;
  let cwd = "";

  beforeEach(() => {
    testIndex += 1;
    cwd = `${MOUNT}/t${testIndex}`;
    vi.resetModules();
    vfs = create();
    vfs.mount(MOUNT);
    vi.doMock("node:fs", () => _require("node:fs"));
  });

  afterEach(() => {
    vfs.unmount();
    vi.doUnmock("node:fs");
    vi.clearAllMocks();
  });

  it("should run all seed files when no specific file is given", async () => {
    vfs.addDirectory(`${cwd}/src/db/seeds`, (dir) => {
      dir.addFile("users.ts", "");
      dir.addFile("posts.ts", "");
    });

    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], file: "", env: ".env", cwd },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    // Two seed files: users.ts and posts.ts
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", `${cwd}/src/db/seeds/posts.ts`],
      { stdio: "inherit", cwd },
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", `${cwd}/src/db/seeds/users.ts`],
      { stdio: "inherit", cwd },
    );
  });

  it("should run a specific seed file with .ts extension when given", async () => {
    vfs.addDirectory(`${cwd}/src/db/seeds`, (dir) => {
      dir.addFile("users.ts", "");
    });

    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        file: "users.ts",
        env: ".env",
        cwd,
      },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", `${cwd}/src/db/seeds/users.ts`],
      { stdio: "inherit", cwd },
    );
  });

  it("should append .ts extension when file is given without it", async () => {
    vfs.addDirectory(`${cwd}/src/db/seeds`, (dir) => {
      dir.addFile("users.ts", "");
    });

    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        file: "users",
        env: ".env",
        cwd,
      },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", `${cwd}/src/db/seeds/users.ts`],
      expect.anything(),
    );
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], file: "users", env: ".env", cwd: "" },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      expect.anything(),
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  it("should exit when seeds directory does not exist", async () => {
    // No files/dirs created in VFS → readdirSync throws ENOENT
    const errorSpy = vi
      .spyOn(consola, "error")
      .mockImplementation(() => undefined);
    // Make process.exit throw so execution stops (prevents accessing unset `entries`)
    const exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
      throw new Error("process.exit called");
    }) as unknown as (code?: string | number | null) => never);

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await expect(
      run({
        args: { _: [], file: "", env: ".env", cwd },
        rawArgs: [],
        cmd: dbSeedCommand,
      }),
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should warn and return when seeds directory is empty", async () => {
    // Create the directory but add no files → readdirSync returns []
    vfs.addDirectory(`${cwd}/src/db/seeds`);
    const warnSpy = vi
      .spyOn(consola, "warn")
      .mockImplementation(() => undefined);

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], file: "", env: ".env", cwd },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(warnSpy).toHaveBeenCalledWith("No seed files found.");
    warnSpy.mockRestore();
  });

  it("should exit with non-zero status when a seed fails", async () => {
    vfs.addDirectory(`${cwd}/src/db/seeds`, (dir) => {
      dir.addFile("users.ts", "");
    });

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 } as ReturnType<
      typeof spawnSync
    >);
    const errorSpy = vi
      .spyOn(consola, "error")
      .mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null,
    ) => {
      throw new Error(`process.exit called with code ${code}`);
    }) as (code?: string | number | null) => never);

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await expect(
      run({
        args: {
          _: [],
          file: "users",
          env: ".env",
          cwd,
        },
        rawArgs: [],
        cmd: dbSeedCommand,
      }),
    ).rejects.toThrow();

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should exit with status 1 when seed returns null status", async () => {
    vfs.addDirectory(`${cwd}/src/db/seeds`, (dir) => {
      dir.addFile("users.ts", "");
    });

    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValueOnce({ status: null } as ReturnType<
      typeof spawnSync
    >);
    const errorSpy = vi
      .spyOn(consola, "error")
      .mockImplementation(() => undefined);
    const exitSpy = vi.spyOn(process, "exit").mockImplementation(((
      code?: string | number | null,
    ) => {
      throw new Error(`process.exit: ${code}`);
    }) as unknown as (code?: string | number | null) => never);

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await expect(
      run({
        args: {
          _: [],
          file: "users",
          env: ".env",
          cwd,
        },
        rawArgs: [],
        cmd: dbSeedCommand,
      }),
    ).rejects.toThrowError("process.exit: 1");

    expect(exitSpy).toHaveBeenCalledWith(1);
    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should only run .ts files from the seeds directory", async () => {
    vfs.addDirectory(`${cwd}/src/db/seeds`, (dir) => {
      dir.addFile("users.ts", "");
      dir.addFile("README.md", "");
      dir.addFile("posts.ts", "");
      dir.addFile("config.json", "");
    });

    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], file: "", env: ".env", cwd },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    // Only 2 .ts files should be run
    expect(spawnSync).toHaveBeenCalledTimes(2);
  });

  it("should have correct command metadata", async () => {
    const { dbSeedCommand } = await import("./db-seed.js");
    const meta = dbSeedCommand.meta as CommandMeta;
    expect(meta.name).toBe("db:seed");
    expect(meta.description).toContain("seed");
  });
});
