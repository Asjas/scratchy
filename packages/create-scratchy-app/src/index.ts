#!/usr/bin/env tsx
import {
  cleanSentinelComments,
  stripAuthFiles,
  stripDatabaseFiles,
  stripRendererFiles,
} from "./strip.js";
import {
  type PackageManager,
  copyTemplate,
  defaultProjectName,
  detectPackageManager,
  getInstallCommand,
  getRunCommand,
  initGit,
  installDeps,
  isEmptyDir,
  replaceInFile,
  resolveProjectDir,
} from "./utils.js";
import {
  cancel,
  confirm,
  group,
  intro,
  isCancel,
  log,
  outro,
  select,
  spinner,
  text,
} from "@clack/prompts";
import { createRequire } from "node:module";
import { join } from "node:path";
import pc from "picocolors";

/** Absolute path to the bundled template directory. */
const TEMPLATE_DIR = join(import.meta.dirname, "template");

/** CLI version read from package.json at runtime. */
const require = createRequire(import.meta.url);
const { version: VERSION } = require("../package.json") as {
  version: string;
};

// ─── Parse argv ──────────────────────────────────────────────────────────────

const args = process.argv.slice(2);

/** First positional argument — the project name / path. */
let argProjectName: string | undefined;
/** `--yes` / `-y` flag — skip interactive prompts and use defaults. */
let argYes = false;

for (const arg of args) {
  if (arg === "--yes" || arg === "-y") {
    argYes = true;
  } else if (arg === "--version" || arg === "-v") {
    console.log(VERSION);
    process.exit(0);
  } else if (arg === "--help" || arg === "-h") {
    printHelp();
    process.exit(0);
  } else if (!arg.startsWith("-")) {
    argProjectName = arg;
  }
}

function printHelp(): void {
  console.log(`
${pc.bold("create-scratchy-app")} v${VERSION}

${pc.bold("Usage:")}
  create-scratchy [project-name] [options]
  create-scratchy-app [project-name] [options]

${pc.bold("Options:")}
  --yes, -y     Skip prompts and use defaults
  --version, -v Print version
  --help, -h    Show this help message

${pc.bold("Examples:")}
  pnpm create scratchy-app
  pnpm create scratchy-app my-app
  npx create-scratchy-app my-app
  npx create-scratchy-app my-app --yes
`);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  console.log();
  intro(pc.bgCyan(pc.black(" create-scratchy-app ")));

  console.log(
    pc.dim(
      `  Scaffold a new ${pc.cyan("Scratchy")} application — full-stack TypeScript, powered by Fastify, tRPC, Qwik & Drizzle.\n`,
    ),
  );

  // ── Project name ────────────────────────────────────────────────────────────

  let rawProjectName: string;

  if (argProjectName) {
    rawProjectName = argProjectName;
    log.info(`Using project name: ${pc.cyan(rawProjectName)}`);
  } else if (argYes) {
    rawProjectName = "my-scratchy-app";
  } else {
    const answer = await text({
      message: "Project name:",
      placeholder: "my-scratchy-app",
      defaultValue: "my-scratchy-app",
      validate(value) {
        if (!value.trim()) return "Project name cannot be empty.";
        if (!/^[a-z0-9][-a-z0-9._]*$/i.test(value.trim())) {
          return "Project name must start with a letter or digit and contain only letters, digits, hyphens, dots, or underscores.";
        }
      },
    });

    if (isCancel(answer)) {
      cancel("Operation cancelled.");
      process.exit(0);
    }

    rawProjectName = (answer as string).trim() || "my-scratchy-app";
  }

  const projectDir = resolveProjectDir(rawProjectName);
  const projectName = defaultProjectName(projectDir);

  // ── Check if dir is empty ────────────────────────────────────────────────

  const empty = await isEmptyDir(projectDir);

  if (!empty) {
    if (argYes) {
      log.warn(
        `Directory ${pc.cyan(projectDir)} is not empty. Proceeding anyway (--yes).`,
      );
    } else {
      const overwrite = await confirm({
        message: `Directory ${pc.cyan(projectName)} is not empty. Continue and potentially overwrite files?`,
        initialValue: false,
      });

      if (isCancel(overwrite) || !overwrite) {
        cancel("Operation cancelled.");
        process.exit(0);
      }
    }
  }

  // ── Feature selection ───────────────────────────────────────────────────

  let includeDb = true;
  let includeAuth = true;
  let includeRenderer = true;
  let gitInit = true;
  let installDepsChoice = true;
  let packageManager: PackageManager = detectPackageManager();

  if (!argYes) {
    const options = await group(
      {
        includeDb: () =>
          confirm({
            message: "Include Drizzle ORM + PostgreSQL?",
            initialValue: true,
          }),
        includeAuth: () =>
          confirm({
            message: "Include Better Auth (email & password authentication)?",
            initialValue: true,
          }),
        includeRenderer: () =>
          confirm({
            message: "Include Piscina SSR worker pool (Qwik rendering)?",
            initialValue: true,
          }),
        gitInit: () =>
          confirm({
            message: "Initialise a git repository?",
            initialValue: true,
          }),
        packageManager: () =>
          select<PackageManager>({
            message: "Which package manager do you use?",
            options: [
              { value: "pnpm", label: "pnpm", hint: "recommended" },
              { value: "npm", label: "npm" },
              { value: "yarn", label: "yarn" },
              { value: "bun", label: "bun" },
            ],
            initialValue: detectPackageManager(),
          }),
        installDepsChoice: () =>
          confirm({ message: "Install dependencies now?", initialValue: true }),
      },
      {
        onCancel() {
          cancel("Operation cancelled.");
          process.exit(0);
        },
      },
    );

    includeDb = options.includeDb as boolean;
    includeAuth = options.includeAuth as boolean;
    includeRenderer = options.includeRenderer as boolean;
    gitInit = options.gitInit as boolean;
    packageManager = options.packageManager as PackageManager;
    installDepsChoice = options.installDepsChoice as boolean;

    // If auth is selected, db must also be included (auth needs it).
    if (includeAuth && !includeDb) {
      log.warn("Auth requires Drizzle ORM — enabling database automatically.");
      includeDb = true;
    }
  }

  // ── Scaffold ────────────────────────────────────────────────────────────

  const s = spinner();
  s.start("Scaffolding project…");

  await copyTemplate(TEMPLATE_DIR, projectDir);

  // Replace the placeholder project name in package.json, README, and config.
  const filesToPatch: [string, string | RegExp, string][] = [
    [join(projectDir, "package.json"), /SCRATCHY_PROJECT_NAME/g, projectName],
    [join(projectDir, "README.md"), /SCRATCHY_PROJECT_NAME/g, projectName],
    [join(projectDir, "README.md"), /my-scratchy-app/g, projectName],
  ];

  for (const [file, search, replacement] of filesToPatch) {
    await replaceInFile(file, search, replacement);
  }

  // Remove optional sections if not requested.
  if (!includeDb) {
    await stripDatabaseFiles(projectDir);
  }

  if (!includeAuth) {
    await stripAuthFiles(projectDir);
  }

  if (!includeRenderer) {
    await stripRendererFiles(projectDir);
  }

  // Clean up any remaining sentinel comments from generated files.
  await cleanSentinelComments(projectDir);

  s.stop("Project scaffolded.");

  // ── Git ─────────────────────────────────────────────────────────────────

  if (gitInit) {
    const ok = initGit(projectDir);
    if (ok) {
      log.success("Initialised git repository.");
    } else {
      log.warn("Could not initialise git repository (git not found).");
    }
  }

  // ── Install deps ────────────────────────────────────────────────────────

  if (installDepsChoice) {
    const ins = spinner();
    ins.start(`Installing dependencies with ${pc.cyan(packageManager)}…`);
    const ok = installDeps(projectDir, packageManager);
    if (ok) {
      ins.stop("Dependencies installed.");
    } else {
      ins.stop(
        pc.yellow(
          `Could not install dependencies. Run ${pc.cyan(getInstallCommand(packageManager))} manually.`,
        ),
      );
    }
  }

  // ── Done ─────────────────────────────────────────────────────────────────

  const relativeDir =
    projectDir === process.cwd() ? "." : `./${rawProjectName}`;

  const nextSteps: string[] = [];

  if (projectDir !== process.cwd()) {
    nextSteps.push(`cd ${relativeDir}`);
  }

  if (!installDepsChoice) {
    nextSteps.push(getInstallCommand(packageManager));
  }

  nextSteps.push("cp .env.example .env   # configure environment variables");

  if (includeDb) {
    nextSteps.push("docker compose up -d   # start PostgreSQL + DragonflyDB");
  }

  nextSteps.push(
    getRunCommand(packageManager, "dev") + "         # start the dev server",
  );

  if (includeDb) {
    nextSteps.push(
      getRunCommand(packageManager, "drizzle-kit generate") +
        "  # generate initial migration",
    );
    nextSteps.push(
      getRunCommand(packageManager, "drizzle-kit migrate") +
        "   # apply migrations",
    );
  }

  outro(
    [
      pc.green(pc.bold("✓ Your Scratchy app is ready!")),
      "",
      pc.bold("Next steps:"),
      ...nextSteps.map((step) => `  ${pc.cyan("→")} ${step}`),
      "",
      pc.dim("Docs: https://scratchyjs.com"),
    ].join("\n"),
  );
}

// ─── Run ──────────────────────────────────────────────────────────────────────

main().catch((err: unknown) => {
  console.error(err);
  process.exit(1);
});
