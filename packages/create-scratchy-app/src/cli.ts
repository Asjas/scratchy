import type { PackageManager } from "./utils.js";
import { getInstallCommand, getRunCommand } from "./utils.js";

/** Parsed CLI arguments (pure, no side effects). */
export interface ParsedArgs {
  projectName: string | undefined;
  yes: boolean;
  version: boolean;
  help: boolean;
}

/**
 * Parses the CLI argument array into a typed structure.
 * Does not perform any side effects (no process.exit, no console output).
 */
export function parseArgs(argv: string[]): ParsedArgs {
  let projectName: string | undefined;
  let yes = false;
  let version = false;
  let help = false;

  for (const arg of argv) {
    if (arg === "--yes" || arg === "-y") {
      yes = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (!arg.startsWith("-")) {
      projectName = arg;
    }
  }

  return { projectName, yes, version, help };
}

/** Configuration for building next-step instructions. */
export interface NextStepsConfig {
  projectDir: string;
  rawProjectName: string;
  includeDb: boolean;
  installDepsChoice: boolean;
  packageManager: PackageManager;
}

/**
 * Builds the list of "next steps" instructions shown after scaffolding.
 * Pure function — no I/O, no side effects.
 */
export function buildNextSteps(config: NextStepsConfig): string[] {
  const {
    projectDir,
    rawProjectName,
    includeDb,
    installDepsChoice,
    packageManager,
  } = config;

  const relativeDir =
    projectDir === process.cwd() ? "." : `./${rawProjectName}`;
  const steps: string[] = [];

  if (projectDir !== process.cwd()) {
    steps.push(`cd ${relativeDir}`);
  }

  if (!installDepsChoice) {
    steps.push(getInstallCommand(packageManager));
  }

  steps.push("cp .env.example .env   # configure environment variables");

  if (includeDb) {
    steps.push("docker compose up -d   # start PostgreSQL + DragonflyDB");
  }

  steps.push(
    getRunCommand(packageManager, "dev") + "         # start the dev server",
  );

  if (includeDb) {
    steps.push(
      getRunCommand(packageManager, "drizzle-kit generate") +
        "  # generate initial migration",
    );
    steps.push(
      getRunCommand(packageManager, "drizzle-kit migrate") +
        "   # apply migrations",
    );
  }

  return steps;
}

/**
 * Returns the help text displayed for `--help`.
 * Pure function — no side effects.
 */
export function helpText(version: string): string {
  return `
create-scratchy-app v${version}

Usage:
  create-scratchy [project-name] [options]
  create-scratchy-app [project-name] [options]

Options:
  --yes, -y     Skip prompts and use defaults
  --version, -v Print version
  --help, -h    Show this help message

Examples:
  pnpm create scratchy-app
  pnpm create scratchy-app my-app
  npx create-scratchy-app my-app
  npx create-scratchy-app my-app --yes
`;
}

/**
 * Validates a project name for the interactive prompt.
 * Returns an error message string if invalid, or `undefined` if valid.
 */
export function validateProjectName(value: string): string | undefined {
  if (!value.trim()) return "Project name cannot be empty.";
  if (!/^[a-z0-9][-a-z0-9._]*$/i.test(value.trim())) {
    return "Project name must start with a letter or digit and contain only letters, digits, hyphens, dots, or underscores.";
  }
}
