import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import type { CommandMeta } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// router content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeRouterCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate queries and mutations files", async () => {
    const { makeRouterCommand } = await import("./make-router.js");
    const run = makeRouterCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], name: "post", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeRouterCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "router-queries.ts.hbs",
      expect.objectContaining({
        pascalName: "Post",
        camelName: "post",
        kebabName: "post",
        snakeName: "post",
      }),
    );
    expect(renderTemplate).toHaveBeenCalledWith(
      "router-mutations.ts.hbs",
      expect.objectContaining({
        pascalName: "Post",
        camelName: "post",
      }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routers/post/queries.ts",
      "// router content",
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routers/post/mutations.ts",
      "// router content",
    );
  });

  it("should handle multi-word names with proper casing", async () => {
    const { makeRouterCommand } = await import("./make-router.js");
    const run = makeRouterCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], name: "blogPost", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeRouterCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "router-queries.ts.hbs",
      expect.objectContaining({
        pascalName: "BlogPost",
        camelName: "blogPost",
        kebabName: "blog-post",
        snakeName: "blog_post",
      }),
    );
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { makeRouterCommand } = await import("./make-router.js");
    const run = makeRouterCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], name: "user", cwd: "" },
      rawArgs: [],
      cmd: makeRouterCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/routers/user/queries.ts"),
      "// router content",
    );
  });

  it("should have correct command metadata", async () => {
    const { makeRouterCommand } = await import("./make-router.js");
    const meta = makeRouterCommand.meta as CommandMeta;
    expect(meta.name).toBe("make:router");
    expect(meta.description).toBe("Generate tRPC router queries and mutations");
  });
});
