import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import type { CommandMeta } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// model content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeModelCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate schema, queries, and mutations files", async () => {
    const { makeModelCommand } = await import("./make-model.js");
    const run = makeModelCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        "_": [],
        "name": "Post",
        "columns": "title:text,published:boolean",
        "with-router": false,
        "cwd": "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeModelCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "model.ts.hbs",
      expect.objectContaining({
        pascalName: "Post",
        camelName: "post",
        kebabName: "post",
        snakeName: "post",
      }),
    );
    expect(renderTemplate).toHaveBeenCalledWith(
      "queries.ts.hbs",
      expect.anything(),
    );
    expect(renderTemplate).toHaveBeenCalledWith(
      "mutations.ts.hbs",
      expect.anything(),
    );

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/db/schema/post.ts",
      "// model content",
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/db/queries/posts.ts",
      "// model content",
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/db/mutations/posts.ts",
      "// model content",
    );
  });

  it("should also generate router files when --with-router is true", async () => {
    const { makeModelCommand } = await import("./make-model.js");
    const run = makeModelCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        "_": [],
        "name": "User",
        "columns": "",
        "with-router": true,
        "cwd": "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeModelCommand,
    });

    // Should have 5 files: schema + queries + mutations + router-queries + router-mutations
    expect(writeFile).toHaveBeenCalledTimes(5);
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routers/user/queries.ts",
      "// model content",
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routers/user/mutations.ts",
      "// model content",
    );
  });

  it("should not generate router files when --with-router is false", async () => {
    const { makeModelCommand } = await import("./make-model.js");
    const run = makeModelCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        "_": [],
        "name": "Comment",
        "columns": "",
        "with-router": false,
        "cwd": "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeModelCommand,
    });

    // Only 3 files: schema + queries + mutations
    expect(writeFile).toHaveBeenCalledTimes(3);
  });

  it("should pass parsed columns to the template context", async () => {
    const { makeModelCommand } = await import("./make-model.js");
    const run = makeModelCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        "_": [],
        "name": "Product",
        "columns": "name:text,price:integer",
        "with-router": false,
        "cwd": "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeModelCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "model.ts.hbs",
      expect.objectContaining({
        columns: expect.arrayContaining([
          expect.objectContaining({ name: "name" }),
          expect.objectContaining({ name: "price" }),
        ]),
      }),
    );
  });

  it("should have correct command metadata", async () => {
    const { makeModelCommand } = await import("./make-model.js");
    const meta = makeModelCommand.meta as CommandMeta;
    expect(meta.name).toBe("make:model");
    expect(meta.description).toBe(
      "Generate a Drizzle model (schema, queries, mutations)",
    );
  });
});
