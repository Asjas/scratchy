import type { CommandMeta } from "citty";
import { consola } from "consola";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}));

vi.mock("node:fs", () => ({
  readdirSync: vi.fn().mockReturnValue(["users.ts", "posts.ts"]),
}));

describe("dbSeedCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should run all seed files when no specific file is given", async () => {
    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], file: "", env: ".env", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    // Two seed files: users.ts and posts.ts
    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", "/tmp/test-project/src/db/seeds/users.ts"],
      { stdio: "inherit", cwd: "/tmp/test-project" },
    );
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", "/tmp/test-project/src/db/seeds/posts.ts"],
      { stdio: "inherit", cwd: "/tmp/test-project" },
    );
  });

  it("should run a specific seed file with .ts extension when given", async () => {
    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        file: "users.ts",
        env: ".env",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", "/tmp/test-project/src/db/seeds/users.ts"],
      { stdio: "inherit", cwd: "/tmp/test-project" },
    );
  });

  it("should append .ts extension when file is given without it", async () => {
    const { spawnSync } = await import("node:child_process");
    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        file: "users",
        env: ".env",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(spawnSync).toHaveBeenCalledTimes(1);
    expect(spawnSync).toHaveBeenCalledWith(
      "node",
      ["--env-file=.env", "/tmp/test-project/src/db/seeds/users.ts"],
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
    const { readdirSync } = await import("node:fs");
    vi.mocked(readdirSync).mockImplementationOnce(() => {
      throw new Error("ENOENT: no such file or directory");
    });
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
        args: { _: [], file: "", env: ".env", cwd: "/tmp/test-project" },
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
    const { readdirSync } = await import("node:fs");
    vi.mocked(readdirSync).mockReturnValueOnce([]);
    const warnSpy = vi
      .spyOn(consola, "warn")
      .mockImplementation(() => undefined);

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], file: "", env: ".env", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(warnSpy).toHaveBeenCalledWith("No seed files found.");
    warnSpy.mockRestore();
  });

  it("should exit with non-zero status when a seed fails", async () => {
    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValueOnce({ status: 1 } as ReturnType<
      typeof spawnSync
    >);
    const errorSpy = vi
      .spyOn(consola, "error")
      .mockImplementation(() => undefined);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        (() => undefined) as unknown as (
          code?: string | number | null,
        ) => never,
      );

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        file: "users",
        env: ".env",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should exit with status 1 when seed returns null status", async () => {
    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync).mockReturnValueOnce({ status: null } as ReturnType<
      typeof spawnSync
    >);
    const exitSpy = vi
      .spyOn(process, "exit")
      .mockImplementation(
        (() => undefined) as unknown as (
          code?: string | number | null,
        ) => never,
      );
    vi.spyOn(consola, "error").mockImplementation(() => undefined);

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        file: "users",
        env: ".env",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: dbSeedCommand,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("should only run .ts files from the seeds directory", async () => {
    const { readdirSync } = await import("node:fs");
    const { spawnSync } = await import("node:child_process");
    vi.mocked(readdirSync).mockReturnValueOnce([
      "users.ts",
      "README.md",
      "posts.ts",
      "config.json",
    ] as unknown as ReturnType<typeof readdirSync>);

    const { dbSeedCommand } = await import("./db-seed.js");
    const run = dbSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], file: "", env: ".env", cwd: "/tmp/test-project" },
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
