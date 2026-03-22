import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("// component content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeComponentCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a Qwik component by default", async () => {
    const { makeComponentCommand } = await import("./make-component.js");
    const run = makeComponentCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { name: "UserCard", react: false, cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeComponentCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("component-qwik.tsx.hbs", {
      pascalName: "UserCard",
      camelName: "userCard",
      kebabName: "user-card",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/client/components/qwik/user-card.tsx",
      "// component content",
    );
  });

  it("should generate a React component when --react is passed", async () => {
    const { makeComponentCommand } = await import("./make-component.js");
    const run = makeComponentCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { name: "DataChart", react: true, cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeComponentCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith("component-react.tsx.hbs", {
      pascalName: "DataChart",
      camelName: "dataChart",
      kebabName: "data-chart",
    });
    expect(writeFile).toHaveBeenCalledWith(
      "/tmp/test-project/src/client/components/react/data-chart.tsx",
      "// component content",
    );
  });

  it("should use process.cwd() when cwd is empty", async () => {
    const { makeComponentCommand } = await import("./make-component.js");
    const run = makeComponentCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { name: "Button", react: false, cwd: "" },
      rawArgs: [],
      cmd: makeComponentCommand,
    });

    expect(writeFile).toHaveBeenCalledWith(
      expect.stringContaining("src/client/components/qwik/button.tsx"),
      "// component content",
    );
  });

  it("should have correct command metadata", async () => {
    const { makeComponentCommand } = await import("./make-component.js");
    expect(makeComponentCommand.meta?.name).toBe("make:component");
    expect(makeComponentCommand.meta?.description).toBe(
      "Generate a Qwik or React component",
    );
  });
});
