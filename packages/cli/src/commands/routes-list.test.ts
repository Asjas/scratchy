import { type VirtualFileSystem, create } from "@scratchyjs/vfs";
import type { CommandMeta } from "citty";
import { consola } from "consola";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * VFS patches `require("node:fs")` (the CJS module object), but vitest
 * resolves `node:fs` imports via native ESM by default.  We bridge the gap
 * with `vi.doMock("node:fs", …)` so that every fresh import of `routes-list`
 * after `vi.resetModules()` picks up the VFS-patched CJS exports.
 *
 * Each test mounts a fresh VFS instance at a unique path under MOUNT so files
 * added for one test never bleed into another.
 */
const _require = createRequire(import.meta.url);
const MOUNT = `/tmp/vfs-routes-list-${process.pid}`;

describe("routesListCommand", () => {
  let vfs: VirtualFileSystem;
  let testIndex = 0;
  let cwd = "";

  beforeEach(() => {
    testIndex += 1;
    cwd = `${MOUNT}/t${testIndex}`;
    vi.resetModules();
    vfs = create();
    vfs.mount(MOUNT);
    // Return the CJS module object (already patched by VFS) so that
    // routes-list.ts's destructured bindings get the VFS hooks.
    vi.doMock("node:fs", () => _require("node:fs"));
  });

  afterEach(() => {
    vfs.unmount();
    vi.doUnmock("node:fs");
    vi.restoreAllMocks();
  });

  it("should warn when no routes or routers directories exist", async () => {
    const warnSpy = vi
      .spyOn(consola, "warn")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd },
      rawArgs: [],
      cmd: routesListCommand,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "No routes found. Make sure src/routes/ and src/routers/ exist.",
    );
  });

  it("should list REST routes from routes directory", async () => {
    vfs.addDirectory(`${cwd}/src/routes`);
    vfs.addFile(`${cwd}/src/routes/index.ts`, 'fastify.get("/", handler)');

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd },
      rawArgs: [],
      cmd: routesListCommand,
    });

    expect(successSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 REST route"),
    );

    logSpy.mockRestore();
    successSpy.mockRestore();
  });

  it("should list tRPC procedures from routers directory", async () => {
    vfs.addDirectory(`${cwd}/src/routers/posts`);
    vfs.addFile(
      `${cwd}/src/routers/posts/queries.ts`,
      "  getById: publicProcedure\n    .input(z.string())\n    .query(handler)",
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd },
      rawArgs: [],
      cmd: routesListCommand,
    });

    expect(successSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 tRPC procedure"),
    );

    logSpy.mockRestore();
    successSpy.mockRestore();
  });

  it("should list tRPC mutations (from mutations.ts files)", async () => {
    vfs.addDirectory(`${cwd}/src/routers/posts`);
    vfs.addFile(
      `${cwd}/src/routers/posts/mutations.ts`,
      "  create: protectedProcedure\n    .input(z.object({}))\n    .mutation(handler)",
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd },
      rawArgs: [],
      cmd: routesListCommand,
    });

    // The procedure method should be MUTATION
    const calls = logSpy.mock.calls.flat();
    expect(calls.some((c) => String(c).includes("MUTATION"))).toBe(true);

    logSpy.mockRestore();
    successSpy.mockRestore();
  });

  it("should include routes with no explicit method as wildcard", async () => {
    vfs.addDirectory(`${cwd}/src/routes`);
    vfs.addFile(
      `${cwd}/src/routes/health.ts`,
      "export default function handler() {}",
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd },
      rawArgs: [],
      cmd: routesListCommand,
    });

    // Should be 1 REST route with wildcard method
    const calls = logSpy.mock.calls.flat();
    expect(calls.some((c) => String(c).includes("*"))).toBe(true);

    logSpy.mockRestore();
    successSpy.mockRestore();
  });

  it("should skip index files in routers directory", async () => {
    vfs.addDirectory(`${cwd}/src/routers/posts`);
    vfs.addFile(`${cwd}/src/routers/posts/index.ts`, "export default {}");
    vfs.addFile(
      `${cwd}/src/routers/posts/queries.ts`,
      "  list: publicProcedure.query(handler)",
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd },
      rawArgs: [],
      cmd: routesListCommand,
    });

    expect(successSpy).toHaveBeenCalledWith(
      expect.stringContaining("1 tRPC procedure"),
    );

    logSpy.mockRestore();
    successSpy.mockRestore();
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const warnSpy = vi
      .spyOn(consola, "warn")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "" },
      rawArgs: [],
      cmd: routesListCommand,
    });

    expect(warnSpy).toHaveBeenCalled();
  });

  it("should list multiple HTTP methods for the same route file", async () => {
    vfs.addDirectory(`${cwd}/src/routes`);
    vfs.addFile(
      `${cwd}/src/routes/api.ts`,
      'fastify.get("/", getHandler)\nfastify.post("/", postHandler)',
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd },
      rawArgs: [],
      cmd: routesListCommand,
    });

    expect(successSpy).toHaveBeenCalledWith(
      expect.stringContaining("2 REST route"),
    );

    logSpy.mockRestore();
    successSpy.mockRestore();
  });

  it("should have correct command metadata", async () => {
    const { routesListCommand } = await import("./routes-list.js");
    const meta = routesListCommand.meta as CommandMeta;
    expect(meta.name).toBe("routes:list");
    expect(meta.description).toContain("routes");
  });
});
