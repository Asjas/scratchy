import type { CommandMeta } from "citty";
import { consola } from "consola";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  spawnSync: vi.fn().mockReturnValue({ status: 0 }),
}));

describe("dbFreshCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should run drizzle-kit drop and migrate in sequence", async () => {
    const { spawnSync } = await import("node:child_process");
    const { dbFreshCommand } = await import("./db-fresh.js");
    const run = dbFreshCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], config: "drizzle.config.ts", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: dbFreshCommand,
    });

    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      ["drizzle-kit", "drop", "--force", "--config=drizzle.config.ts"],
      { stdio: "inherit", cwd: "/tmp/test-project" },
    );
    expect(spawnSync).toHaveBeenNthCalledWith(
      2,
      "pnpm",
      ["drizzle-kit", "migrate", "--config=drizzle.config.ts"],
      { stdio: "inherit", cwd: "/tmp/test-project" },
    );
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { spawnSync } = await import("node:child_process");
    const { dbFreshCommand } = await import("./db-fresh.js");
    const run = dbFreshCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], config: "drizzle.config.ts", cwd: "" },
      rawArgs: [],
      cmd: dbFreshCommand,
    });

    expect(spawnSync).toHaveBeenCalledTimes(2);
    expect(spawnSync).toHaveBeenNthCalledWith(
      1,
      "pnpm",
      expect.anything(),
      expect.objectContaining({ cwd: process.cwd() }),
    );
  });

  it("should exit with non-zero status when drizzle-kit drop fails", async () => {
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

    const { dbFreshCommand } = await import("./db-fresh.js");
    const run = dbFreshCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], config: "drizzle.config.ts", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: dbFreshCommand,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should exit with non-zero status when drizzle-kit migrate fails", async () => {
    const { spawnSync } = await import("node:child_process");
    vi.mocked(spawnSync)
      .mockReturnValueOnce({ status: 0 } as ReturnType<typeof spawnSync>)
      .mockReturnValueOnce({ status: 2 } as ReturnType<typeof spawnSync>);
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

    const { dbFreshCommand } = await import("./db-fresh.js");
    const run = dbFreshCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], config: "drizzle.config.ts", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: dbFreshCommand,
    });

    expect(exitSpy).toHaveBeenCalledWith(2);
    expect(errorSpy).toHaveBeenCalled();

    errorSpy.mockRestore();
    exitSpy.mockRestore();
  });

  it("should exit with status 1 when drop returns null status", async () => {
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

    const { dbFreshCommand } = await import("./db-fresh.js");
    const run = dbFreshCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], config: "drizzle.config.ts", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: dbFreshCommand,
    });

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("should have correct command metadata", async () => {
    const { dbFreshCommand } = await import("./db-fresh.js");
    const meta = dbFreshCommand.meta as CommandMeta;
    expect(meta.name).toBe("db:fresh");
    expect(meta.description).toContain("Drop all tables");
  });
});
