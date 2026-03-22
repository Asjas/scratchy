import { renderTemplate } from "../utils/render.js";
import { writeFile } from "../utils/write-file.js";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../utils/render.js", () => ({
  renderTemplate: vi.fn().mockReturnValue("-- migration content"),
}));
vi.mock("../utils/write-file.js", () => ({
  writeFile: vi.fn().mockResolvedValue(undefined),
}));

describe("makeMigrationCommand", () => {
  afterEach(() => {
    vi.clearAllMocks();
  });

  it("should generate a migration file with timestamp prefix", async () => {
    const { makeMigrationCommand } = await import("./make-migration.js");
    const run = makeMigrationCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { name: "add_role_to_users", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeMigrationCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "migration.sql.hbs",
      expect.objectContaining({
        name: expect.stringContaining("add_role_to_users"),
      }),
    );
    // Verify the write path contains the migrations directory and .sql extension
    const writePath = vi.mocked(writeFile).mock.calls[0]?.[0] as string;
    expect(writePath).toContain("src/db/migrations/");
    expect(writePath).toMatch(/\.sql$/);
    expect(writePath).toMatch(/\d{14}_add_role_to_users\.sql$/);
  });

  it("should convert kebab-case names to snake_case", async () => {
    const { makeMigrationCommand } = await import("./make-migration.js");
    const run = makeMigrationCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({
      args: { name: "addRoleToUsers", cwd: "/tmp/test-project" },
      rawArgs: [],
      cmd: makeMigrationCommand,
    });

    expect(renderTemplate).toHaveBeenCalledWith(
      "migration.sql.hbs",
      expect.objectContaining({
        name: "add_role_to_users",
      }),
    );
  });

  it("should have correct command metadata", async () => {
    const { makeMigrationCommand } = await import("./make-migration.js");
    expect(makeMigrationCommand.meta?.name).toBe("make:migration");
  });
});
