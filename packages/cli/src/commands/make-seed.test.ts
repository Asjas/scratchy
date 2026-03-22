import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import type { CommandMeta } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// seed content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeSeedCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a seed file with correct names", async () => {
    const { makeSeedCommand } = await import("./make-seed.js");
    const run = makeSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], name: "Users", model: "", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeSeedCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "seed.ts.hbs",
      expect.objectContaining({
        pascalName: "Users",
        camelName: "users",
        kebabName: "users",
        model: "",
        modelPascalName: "",
      }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/db/seeds/users.ts",
      "// seed content",
    );
  });

  it("should include model-specific variables when --model is provided", async () => {
    const { makeSeedCommand } = await import("./make-seed.js");
    const run = makeSeedCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "InitialData",
        model: "User",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeSeedCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "seed.ts.hbs",
      expect.objectContaining({
        pascalName: "InitialData",
        model: "User",
        modelPascalName: "User",
        modelCamelName: "user",
        modelKebabName: "user",
      }),
    );
  });

  it("should have correct command metadata", async () => {
    const { makeSeedCommand } = await import("./make-seed.js");
    const meta = makeSeedCommand.meta as CommandMeta;
    expect(meta.name).toBe("make:seed");
    expect(meta.description).toBe("Generate a database seed file");
  });
});
