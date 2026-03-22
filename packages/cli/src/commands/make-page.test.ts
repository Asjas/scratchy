import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// page content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makePageCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a page file at the correct path", async () => {
    const { makePageCommand } = await import("./make-page.js");
    const run = makePageCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { path: "blog", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makePageCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("page.tsx.hbs", {
      pascalName: "Blog",
      camelName: "blog",
      kebabName: "blog",
      routePath: "blog",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/client/routes/blog/index.tsx",
      "// page content",
    );
  });

  it("should handle dynamic route segments", async () => {
    const { makePageCommand } = await import("./make-page.js");
    const run = makePageCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { path: "blog/[slug]", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makePageCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("page.tsx.hbs", {
      pascalName: "BlogSlug",
      camelName: "blogSlug",
      kebabName: "blog-slug",
      routePath: "blog/[slug]",
    });
  });

  it("should strip leading slash from route path", async () => {
    const { makePageCommand } = await import("./make-page.js");
    const run = makePageCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { path: "/about", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makePageCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "page.tsx.hbs",
      expect.objectContaining({ routePath: "about" }),
    );
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { makePageCommand } = await import("./make-page.js");
    const run = makePageCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { path: "settings", cwd: "" },
      rawArgs: [],
      cmd: makePageCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/client/routes/settings/index.tsx"),
      "// page content",
    );
  });

  it("should have correct command metadata", async () => {
    const { makePageCommand } = await import("./make-page.js");
    expect(makePageCommand.meta?.name).toBe("make:page");
    expect(makePageCommand.meta?.description).toBe(
      "Generate a Qwik page with routeLoader$",
    );
  });
});
