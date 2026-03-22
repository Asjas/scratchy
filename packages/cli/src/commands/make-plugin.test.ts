import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import type { CommandMeta } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// plugin content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makePluginCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a plugin file with correct names", async () => {
    const { makePluginCommand } = await import("./make-plugin.js");
    const run = makePluginCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], name: "myService", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makePluginCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("plugin.ts.hbs", {
      pascalName: "MyService",
      camelName: "myService",
      kebabName: "my-service",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/plugins/app/my-service.ts",
      "// plugin content",
    );
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { makePluginCommand } = await import("./make-plugin.js");
    const run = makePluginCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], name: "cache", cwd: "" },
      rawArgs: [],
      cmd: makePluginCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/plugins/app/cache.ts"),
      "// plugin content",
    );
  });

  it("should have correct command metadata", async () => {
    const { makePluginCommand } = await import("./make-plugin.js");
    const meta = makePluginCommand.meta as CommandMeta;
    expect(meta.name).toBe("make:plugin");
    expect(meta.description).toBe("Generate a Fastify plugin");
  });
});
