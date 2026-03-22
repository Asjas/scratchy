import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import type { CommandMeta } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// route content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeRouteCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a route file at the correct path", async () => {
    const { makeRouteCommand } = await import("./make-route.js");
    const run = makeRouteCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        path: "external/api/v1/products",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeRouteCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("route.ts.hbs", {
      routePath: "external/api/v1/products",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routes/external/api/v1/products/index.ts",
      "// route content",
    );
  });

  it("should strip leading slash from route path", async () => {
    const { makeRouteCommand } = await import("./make-route.js");
    const run = makeRouteCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], path: "/users", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeRouteCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("route.ts.hbs", {
      routePath: "users",
    });
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { makeRouteCommand } = await import("./make-route.js");
    const run = makeRouteCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], path: "health", cwd: "" },
      rawArgs: [],
      cmd: makeRouteCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/routes/health/index.ts"),
      "// route content",
    );
  });

  it("should have correct command metadata", async () => {
    const { makeRouteCommand } = await import("./make-route.js");
    const meta = makeRouteCommand.meta as CommandMeta;
    expect(meta.name).toBe("make:route");
    expect(meta.description).toBe("Generate a Fastify REST route");
  });
});
