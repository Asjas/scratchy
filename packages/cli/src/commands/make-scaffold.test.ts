import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import type { CommandMeta } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// generated content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeScaffoldCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate 9 files for a complete scaffold", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "name:text,price:numeric",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(writeFile).toHaveBeenCalledTimes(9);
  });

  it("should generate schema file", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "name:text",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "model.ts.hbs",
      expect.objectContaining({ pascalName: "Product" }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/db/schema/product.ts",
      "// generated content",
    );
  });

  it("should generate queries file", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "queries.ts.hbs",
      expect.objectContaining({ kebabName: "product" }),
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/db/queries/products.ts",
      "// generated content",
    );
  });

  it("should generate mutations file", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "mutations.ts.hbs",
      expect.anything(),
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/db/mutations/products.ts",
      "// generated content",
    );
  });

  it("should generate router query and mutation files", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routers/product/queries.ts",
      "// generated content",
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routers/product/mutations.ts",
      "// generated content",
    );
  });

  it("should generate list and detail page files", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/client/routes/product/index.tsx",
      "// generated content",
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/client/routes/product/[id]/index.tsx",
      "// generated content",
    );
  });

  it("should generate card and form component files", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/client/components/qwik/product-card.tsx",
      "// generated content",
    );
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/client/components/qwik/product-form.tsx",
      "// generated content",
    );
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Order",
        columns: "",
        cwd: "",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    // All 9 write calls should use process.cwd() as the base
    expect(writeFile).toHaveBeenCalledTimes(9);
    const calls = vi.mocked(writeFile).mock.calls;
    for (const [path] of calls) {
      expect(path).toContain(process.cwd());
    }
  });

  it("should use correct PascalCase for context names", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "blog-post",
        columns: "title:text",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "model.ts.hbs",
      expect.objectContaining({
        pascalName: "BlogPost",
        camelName: "blogPost",
        kebabName: "blog-post",
        snakeName: "blog_post",
      }),
    );
  });

  it("should pass parsed columns to templates", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const run = makeScaffoldCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        name: "Product",
        columns: "title:text,price:numeric",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeScaffoldCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "model.ts.hbs",
      expect.objectContaining({
        columns: expect.arrayContaining([
          expect.objectContaining({ name: "title" }),
          expect.objectContaining({ name: "price" }),
        ]),
      }),
    );
  });

  it("should have correct command metadata", async () => {
    const { makeScaffoldCommand } = await import("./make-scaffold.js");
    const meta = makeScaffoldCommand.meta as CommandMeta;
    expect(meta.name).toBe("make:scaffold");
    expect(meta.description).toContain("full feature set");
  });
});
