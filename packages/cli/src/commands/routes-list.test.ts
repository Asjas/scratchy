import type { CommandMeta } from "citty";
import { consola } from "consola";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
  statSync: vi.fn(),
}));

describe("routesListCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should warn when no routes or routers directories exist", async () => {
    const { readdirSync } = await import("node:fs");
    vi.mocked(readdirSync).mockReturnValue([]);
    const warnSpy = vi
      .spyOn(consola, "warn")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: routesListCommand,
    });

    expect(warnSpy).toHaveBeenCalledWith(
      "No routes found. Make sure src/routes/ and src/routers/ exist.",
    );
    warnSpy.mockRestore();
  });

  it("should list REST routes from routes directory", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");

    vi.mocked(readdirSync).mockImplementation((dir) => {
      if (String(dir).endsWith("routes")) {
        return ["index.ts"] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => false,
    } as ReturnType<typeof statSync>);

    vi.mocked(readFileSync).mockReturnValue(
      'fastify.get("/", handler)' as unknown as ReturnType<typeof readFileSync>,
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "/tmp/test-project" },
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
    const { readdirSync, readFileSync, statSync } = await import("node:fs");

    vi.mocked(readdirSync).mockImplementation((dir) => {
      const dirStr = String(dir);
      if (dirStr.endsWith("routers")) {
        return ["posts"] as unknown as ReturnType<typeof readdirSync>;
      }
      if (dirStr.endsWith("posts")) {
        return ["queries.ts"] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    vi.mocked(statSync).mockImplementation((p) => {
      const pathStr = String(p);
      return {
        isDirectory: () => pathStr.endsWith("posts"),
      } as ReturnType<typeof statSync>;
    });

    vi.mocked(readFileSync).mockReturnValue(
      "  getById: publicProcedure\n    .input(z.string())\n    .query(handler)" as unknown as ReturnType<
        typeof readFileSync
      >,
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "/tmp/test-project" },
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
    const { readdirSync, readFileSync, statSync } = await import("node:fs");

    vi.mocked(readdirSync).mockImplementation((dir) => {
      const dirStr = String(dir);
      if (dirStr.endsWith("routers")) {
        return ["posts"] as unknown as ReturnType<typeof readdirSync>;
      }
      if (dirStr.endsWith("posts")) {
        return ["mutations.ts"] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    vi.mocked(statSync).mockImplementation((p) => {
      const pathStr = String(p);
      return {
        isDirectory: () => pathStr.endsWith("posts"),
      } as ReturnType<typeof statSync>;
    });

    vi.mocked(readFileSync).mockReturnValue(
      "  create: protectedProcedure\n    .input(z.object({}))\n    .mutation(handler)" as unknown as ReturnType<
        typeof readFileSync
      >,
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "/tmp/test-project" },
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
    const { readdirSync, readFileSync, statSync } = await import("node:fs");

    vi.mocked(readdirSync).mockImplementation((dir) => {
      if (String(dir).endsWith("routes")) {
        return ["health.ts"] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => false,
    } as ReturnType<typeof statSync>);

    // No fastify.get/post/etc — so it should be listed as "*"
    vi.mocked(readFileSync).mockReturnValue(
      "export default function handler() {}" as unknown as ReturnType<
        typeof readFileSync
      >,
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "/tmp/test-project" },
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
    const { readdirSync, readFileSync, statSync } = await import("node:fs");

    vi.mocked(readdirSync).mockImplementation((dir) => {
      const dirStr = String(dir);
      if (dirStr.endsWith("routers")) {
        return ["posts"] as unknown as ReturnType<typeof readdirSync>;
      }
      if (dirStr.endsWith("posts")) {
        return ["index.ts", "queries.ts"] as unknown as ReturnType<
          typeof readdirSync
        >;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    vi.mocked(statSync).mockImplementation((p) => {
      const pathStr = String(p);
      return {
        isDirectory: () => pathStr.endsWith("posts"),
      } as ReturnType<typeof statSync>;
    });

    vi.mocked(readFileSync).mockReturnValue(
      "  list: publicProcedure.query(handler)" as unknown as ReturnType<
        typeof readFileSync
      >,
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "/tmp/test-project" },
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
    const { readdirSync } = await import("node:fs");
    vi.mocked(readdirSync).mockReturnValue([]);
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
    warnSpy.mockRestore();
  });

  it("should list multiple HTTP methods for the same route file", async () => {
    const { readdirSync, readFileSync, statSync } = await import("node:fs");

    vi.mocked(readdirSync).mockImplementation((dir) => {
      if (String(dir).endsWith("routes")) {
        return ["api.ts"] as unknown as ReturnType<typeof readdirSync>;
      }
      return [] as unknown as ReturnType<typeof readdirSync>;
    });

    vi.mocked(statSync).mockReturnValue({
      isDirectory: () => false,
    } as ReturnType<typeof statSync>);

    vi.mocked(readFileSync).mockReturnValue(
      'fastify.get("/", getHandler)\nfastify.post("/", postHandler)' as unknown as ReturnType<
        typeof readFileSync
      >,
    );

    const logSpy = vi.spyOn(consola, "log").mockImplementation(() => undefined);
    const successSpy = vi
      .spyOn(consola, "success")
      .mockImplementation(() => undefined);

    const { routesListCommand } = await import("./routes-list.js");
    const run = routesListCommand.run;
    if (!run) throw new Error("run is undefined");

    run({
      args: { _: [], cwd: "/tmp/test-project" },
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
