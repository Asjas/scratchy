import {
  type NextStepsConfig,
  buildNextSteps,
  helpText,
  parseArgs,
  validateProjectName,
} from "./cli.js";
import { describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// parseArgs
// ---------------------------------------------------------------------------

describe("parseArgs", () => {
  it("returns defaults for empty argv", () => {
    const result = parseArgs([]);
    expect(result).toEqual({
      projectName: undefined,
      yes: false,
      version: false,
      help: false,
    });
  });

  it("parses a bare project name", () => {
    const result = parseArgs(["my-app"]);
    expect(result.projectName).toBe("my-app");
    expect(result.yes).toBe(false);
  });

  it("parses --yes flag", () => {
    expect(parseArgs(["--yes"]).yes).toBe(true);
  });

  it("parses -y shorthand", () => {
    expect(parseArgs(["-y"]).yes).toBe(true);
  });

  it("parses --version flag", () => {
    expect(parseArgs(["--version"]).version).toBe(true);
  });

  it("parses -v shorthand", () => {
    expect(parseArgs(["-v"]).version).toBe(true);
  });

  it("parses --help flag", () => {
    expect(parseArgs(["--help"]).help).toBe(true);
  });

  it("parses -h shorthand", () => {
    expect(parseArgs(["-h"]).help).toBe(true);
  });

  it("parses project name with --yes flag", () => {
    const result = parseArgs(["my-app", "--yes"]);
    expect(result.projectName).toBe("my-app");
    expect(result.yes).toBe(true);
  });

  it("parses project name with -y flag in any order", () => {
    const result = parseArgs(["-y", "my-app"]);
    expect(result.projectName).toBe("my-app");
    expect(result.yes).toBe(true);
  });

  it("ignores unknown flags", () => {
    const result = parseArgs(["--unknown", "my-app"]);
    expect(result.projectName).toBe("my-app");
  });

  it("takes the last positional argument as project name", () => {
    const result = parseArgs(["first", "second"]);
    expect(result.projectName).toBe("second");
  });

  it("handles multiple flags together", () => {
    const result = parseArgs(["--version", "--help", "--yes"]);
    expect(result.version).toBe(true);
    expect(result.help).toBe(true);
    expect(result.yes).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildNextSteps
// ---------------------------------------------------------------------------

describe("buildNextSteps", () => {
  const baseConfig: NextStepsConfig = {
    projectDir: "/home/user/projects/my-app",
    rawProjectName: "my-app",
    includeDb: true,
    installDepsChoice: true,
    packageManager: "pnpm",
  };

  it("includes cd step when projectDir differs from cwd", () => {
    const steps = buildNextSteps(baseConfig);
    expect(steps[0]).toBe("cd ./my-app");
  });

  it("omits cd step when projectDir equals cwd", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      projectDir: process.cwd(),
    });
    expect(steps.every((s) => !s.startsWith("cd "))).toBe(true);
  });

  it("includes install command when deps not installed", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      installDepsChoice: false,
    });
    expect(steps.some((s) => s === "pnpm install")).toBe(true);
  });

  it("omits install command when deps already installed", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      installDepsChoice: true,
    });
    expect(steps.every((s) => s !== "pnpm install")).toBe(true);
  });

  it("includes docker compose when db is included", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      includeDb: true,
    });
    expect(steps.some((s) => s.includes("docker compose up -d"))).toBe(true);
  });

  it("omits docker compose when db is not included", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      includeDb: false,
    });
    expect(steps.every((s) => !s.includes("docker compose"))).toBe(true);
  });

  it("includes drizzle-kit steps when db is included", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      includeDb: true,
    });
    expect(steps.some((s) => s.includes("drizzle-kit generate"))).toBe(true);
    expect(steps.some((s) => s.includes("drizzle-kit migrate"))).toBe(true);
  });

  it("omits drizzle-kit steps when db is not included", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      includeDb: false,
    });
    expect(steps.every((s) => !s.includes("drizzle-kit"))).toBe(true);
  });

  it("always includes env copy step", () => {
    const steps = buildNextSteps(baseConfig);
    expect(steps.some((s) => s.includes("cp .env.example .env"))).toBe(true);
  });

  it("always includes dev server step", () => {
    const steps = buildNextSteps(baseConfig);
    expect(steps.some((s) => s.includes("pnpm dev"))).toBe(true);
  });

  it("uses correct package manager commands for npm", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      packageManager: "npm",
      installDepsChoice: false,
    });
    expect(steps.some((s) => s === "npm install")).toBe(true);
    expect(steps.some((s) => s.includes("npm run dev"))).toBe(true);
  });

  it("uses correct package manager commands for yarn", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      packageManager: "yarn",
      installDepsChoice: false,
    });
    expect(steps.some((s) => s === "yarn")).toBe(true);
    expect(steps.some((s) => s.includes("yarn dev"))).toBe(true);
  });

  it("uses correct package manager commands for bun", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      packageManager: "bun",
      installDepsChoice: false,
    });
    expect(steps.some((s) => s === "bun install")).toBe(true);
    expect(steps.some((s) => s.includes("bun run dev"))).toBe(true);
  });

  it("returns minimal steps when projectDir is cwd, deps installed, no db", () => {
    const steps = buildNextSteps({
      ...baseConfig,
      projectDir: process.cwd(),
      installDepsChoice: true,
      includeDb: false,
    });
    expect(steps).toEqual([
      "cp .env.example .env   # configure environment variables",
      "pnpm dev         # start the dev server",
    ]);
  });
});

// ---------------------------------------------------------------------------
// helpText
// ---------------------------------------------------------------------------

describe("helpText", () => {
  it("includes the version number", () => {
    const output = helpText("1.2.3");
    expect(output).toContain("v1.2.3");
  });

  it("includes usage section", () => {
    const output = helpText("0.1.0");
    expect(output).toContain("Usage:");
    expect(output).toContain("create-scratchy [project-name] [options]");
    expect(output).toContain("create-scratchy-app [project-name] [options]");
  });

  it("includes all option flags", () => {
    const output = helpText("0.1.0");
    expect(output).toContain("--yes, -y");
    expect(output).toContain("--version, -v");
    expect(output).toContain("--help, -h");
  });

  it("includes examples section", () => {
    const output = helpText("0.1.0");
    expect(output).toContain("Examples:");
    expect(output).toContain("pnpm create scratchy-app");
    expect(output).toContain("npx create-scratchy-app my-app");
    expect(output).toContain("npx create-scratchy-app my-app --yes");
  });
});

// ---------------------------------------------------------------------------
// validateProjectName
// ---------------------------------------------------------------------------

describe("validateProjectName", () => {
  it("returns undefined for valid names", () => {
    expect(validateProjectName("my-app")).toBeUndefined();
    expect(validateProjectName("my_app")).toBeUndefined();
    expect(validateProjectName("MyApp")).toBeUndefined();
    expect(validateProjectName("app123")).toBeUndefined();
    expect(validateProjectName("a")).toBeUndefined();
  });

  it("returns error for empty string", () => {
    expect(validateProjectName("")).toBe("Project name cannot be empty.");
  });

  it("returns error for whitespace-only string", () => {
    expect(validateProjectName("   ")).toBe("Project name cannot be empty.");
  });

  it("returns error for names starting with a hyphen", () => {
    const result = validateProjectName("-my-app");
    expect(result).toContain("must start with a letter or digit");
  });

  it("returns error for names starting with a dot", () => {
    const result = validateProjectName(".my-app");
    expect(result).toContain("must start with a letter or digit");
  });

  it("returns error for names with special characters", () => {
    expect(validateProjectName("my app")).toContain(
      "must start with a letter or digit",
    );
    expect(validateProjectName("my@app")).toContain(
      "must start with a letter or digit",
    );
    expect(validateProjectName("my/app")).toContain(
      "must start with a letter or digit",
    );
  });

  it("allows dots in the middle", () => {
    expect(validateProjectName("my.app")).toBeUndefined();
  });

  it("allows underscores in the middle", () => {
    expect(validateProjectName("my_app")).toBeUndefined();
  });

  it("allows names starting with digits", () => {
    expect(validateProjectName("1app")).toBeUndefined();
  });
});
