import { writeFile } from "./write-file.js";
import { readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("consola", () => ({
  consola: {
    success: vi.fn(),
  },
}));

describe("writeFile", () => {
  const tmpDir = join(
    tmpdir(),
    `write-file-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );

  afterEach(async () => {
    await rm(tmpDir, { recursive: true, force: true });
  });

  it("creates the file with the given content", async () => {
    const filePath = join(tmpDir, "test.ts");
    await writeFile(filePath, "const x = 1;");

    const content = await readFile(filePath, "utf8");
    expect(content).toBe("const x = 1;");
  });

  it("creates parent directories recursively", async () => {
    const filePath = join(tmpDir, "deep", "nested", "dir", "file.ts");
    await writeFile(filePath, "export {}");

    const content = await readFile(filePath, "utf8");
    expect(content).toBe("export {}");
  });

  it("logs success via consola", async () => {
    const consola = await import("consola");
    const filePath = join(tmpDir, "logged.ts");
    await writeFile(filePath, "content");

    expect(consola.consola.success).toHaveBeenCalledWith(`Created ${filePath}`);
  });
});
