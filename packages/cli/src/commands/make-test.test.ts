import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import type { CommandMeta } from "citty";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// test content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeTestCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a test file at the correct path", async () => {
    const { makeTestCommand } = await import("./make-test.js");
    const run = makeTestCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: {
        _: [],
        path: "routers/posts/queries",
        cwd: "/tmp/test-project",
      },
      rawArgs: [],
      cmd: makeTestCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("test.ts.hbs", {
      name: "queries",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/routers/posts/queries.test.ts",
      "// test content",
    );
  });

  it("should strip leading slash from path", async () => {
    const { makeTestCommand } = await import("./make-test.js");
    const run = makeTestCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], path: "/utils/helpers", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeTestCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("test.ts.hbs", {
      name: "helpers",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/utils/helpers.test.ts",
      "// test content",
    );
  });

  it("should reject paths that escape src/ directory", async () => {
    const { makeTestCommand } = await import("./make-test.js");
    const run = makeTestCommand.run;
    if (!run) throw new Error("run is undefined");

    const exitSpy = vi.spyOn(process, "exit").mockImplementation(() => {
      throw new Error("process.exit called");
    });

    await expect(
      run({
        args: { _: [], path: "../../etc/passwd", cwd: "/tmp/test-project" },
        rawArgs: [],
        cmd: makeTestCommand,
      }),
    ).rejects.toThrow("process.exit called");

    expect(exitSpy).toHaveBeenCalledWith(1);
    exitSpy.mockRestore();
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { makeTestCommand } = await import("./make-test.js");
    const run = makeTestCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { _: [], path: "lib/utils", cwd: "" },
      rawArgs: [],
      cmd: makeTestCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/lib/utils.test.ts"),
      "// test content",
    );
  });

  it("should have correct command metadata", async () => {
    const { makeTestCommand } = await import("./make-test.js");
    const meta = makeTestCommand.meta as CommandMeta;
    expect(meta.name).toBe("make:test");
    expect(meta.description).toBe("Generate a Vitest test file");
  });
});
