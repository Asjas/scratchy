---
name: testing-vitest
description:
  "Guides the writing of unit, integration, and CLI command tests in the
  Scratchy framework using Vitest and the @scratchyjs/vfs in-memory virtual
  filesystem. Use when creating or reviewing test files, adding tests for CLI
  commands, replacing vi.mock('node:fs') stubs, or choosing between
  @scratchyjs/vfs and vi.doMock. Trigger terms: Vitest, test, unit test,
  integration test, VFS, virtual filesystem, node:fs mock, vi.mock, vi.doMock,
  CLI command test, filesystem test, addFile, addDirectory, mount, unmount."
metadata:
  tags: testing, vitest, vfs, virtual-filesystem, cli, unit, integration
applyTo: "**/*.test.ts,**/*.test.tsx,**/tests/**/*.ts,**/vitest.config.ts"
---

# Testing in Scratchy

## When to Use

Use these patterns when:

- Writing unit tests for utilities, tRPC routers, or Fastify routes
- Writing CLI command tests that interact with the filesystem
- Replacing brittle `vi.mock("node:fs")` / `vi.mock("node:fs/promises")` stubs
- Choosing between `@scratchyjs/vfs` and manual `vi.doMock` for filesystem tests
- Setting up isolated test environments with `createTestServer()`,
  `createTestDatabase()`, or `mockSession()`

---

## Tools

| Tool                 | Purpose                                                         |
| -------------------- | --------------------------------------------------------------- |
| **Vitest**           | Unit, integration, and component tests                          |
| **Cypress**          | End-to-end browser testing                                      |
| **@scratchyjs/vfs**  | In-memory virtual filesystem for CLI and filesystem-heavy tests |
| **fastify.inject()** | In-process HTTP testing without a live server                   |
| **Testing Library**  | DOM assertions for component tests                              |
| **@qwik/testing**    | `createDOM` for Qwik component rendering                        |

---

## Testing CLI Commands with `@scratchyjs/vfs`

CLI commands that read from or write to the filesystem **must** be tested with
`@scratchyjs/vfs` instead of `vi.mock("node:fs")` or
`vi.mock("node:fs/promises")`. Module-hoisting stubs:

- are fragile — adding a new path means editing the factory;
- are disconnected from real behaviour — they assert on calls, not state;
- leave no trace — the test cannot verify that a file was actually created or
  deleted.

`@scratchyjs/vfs` patches the `node:fs` CJS module object directly, so commands
run against a fully functional in-memory filesystem and tests can assert on the
resulting state via `vfs.existsSync()` / `vfs.readFileSync()`.

### Add `@scratchyjs/vfs` as a `devDependency`

```jsonc
// package.json
{
  "devDependencies": {
    "@scratchyjs/vfs": "workspace:*",
  },
}
```

---

## Pattern 1 — Async `node:fs/promises`

Use this when the command under test calls `fs.promises.*` methods (`rm`,
`readFile`, `writeFile`, `mkdir`, etc.).

```typescript
import { type VirtualFileSystem, create } from "@scratchyjs/vfs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const MOUNT = `/tmp/vfs-my-command-${process.pid}`;

describe("myCommand", () => {
  let vfs: VirtualFileSystem;

  beforeEach(() => {
    // Reset modules so the dynamic import() in the test re-executes
    // the command's top-level imports against the freshly-mounted VFS.
    vi.resetModules();
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    // Restore the original node:fs methods — no disk residue.
    vfs.unmount();
    vi.doUnmock("node:fs/promises");
    vi.restoreAllMocks();
  });

  it("removes the output directory", async () => {
    // ① Pre-populate the VFS so the command finds the paths it should touch.
    vfs.addDirectory(`${MOUNT}/dist`);

    // ② Dynamically import the command — picks up the VFS-patched CJS exports.
    const { myCommand } = await import("./my-command.js");
    const run = myCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({ args: { _: [], cwd: MOUNT }, rawArgs: [], cmd: myCommand });

    // ③ Assert on real VFS state — no call-count assertions needed.
    expect(vfs.existsSync(`${MOUNT}/dist`)).toBe(false);
  });

  it("handles a failing rm gracefully (error path)", async () => {
    // VFS has no per-path error injection — stub the whole module for this case.
    const rmMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("ENOENT"))
      .mockResolvedValue(undefined);
    vi.doMock("node:fs/promises", () => ({ rm: rmMock }));

    const { myCommand } = await import("./my-command.js");
    const run = myCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({ args: { _: [], cwd: MOUNT }, rawArgs: [], cmd: myCommand });

    expect(rmMock).toHaveBeenCalled();
  });
});
```

### Key sequence

1. `vi.resetModules()` — clears the module registry so the command re-imports.
2. `vfs.mount(MOUNT)` — patches `node:fs` CJS methods to intercept the prefix.
3. `vfs.addDirectory / addFile` — pre-populates the virtual filesystem.
4. Dynamic `await import(...)` — the command now sees VFS-patched methods.
5. Run the command.
6. Assert with `vfs.existsSync()` / `vfs.readFileSync()` — real state queries.
7. `vfs.unmount()` in `afterEach` — restores originals.

---

## Pattern 2 — Sync `node:fs` with the `vi.doMock` bridge

Vitest resolves `node:fs` imports via native ESM (non-writable namespace
bindings). VFS patches the **CJS module object**, which is different.

To bridge the gap: call `vi.doMock("node:fs", () => _require("node:fs"))` after
`vfs.mount()` so that every fresh `import()` of the command receives the
already-patched CJS reference.

```typescript
import { type VirtualFileSystem, create } from "@scratchyjs/vfs";
import { createRequire } from "node:module";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// `_require` gives us the mutable CJS module object that VFS patches.
const _require = createRequire(import.meta.url);
const MOUNT = `/tmp/vfs-my-sync-cmd-${process.pid}`;

describe("mySyncCommand", () => {
  let vfs: VirtualFileSystem;
  let testIndex = 0;
  let cwd = "";

  beforeEach(() => {
    // Increment index so each test gets an isolated sub-directory.
    testIndex += 1;
    cwd = `${MOUNT}/t${testIndex}`;

    vi.resetModules();
    vfs = create();
    vfs.mount(MOUNT);

    // Bridge: hand the Vitest module registry the CJS object that VFS has
    // already patched.  Any import of "node:fs" in the command after this
    // point will receive the patched reference.
    vi.doMock("node:fs", () => _require("node:fs"));
  });

  afterEach(() => {
    vfs.unmount();
    vi.doUnmock("node:fs");
    vi.clearAllMocks();
  });

  it("reads files from the virtual directory", async () => {
    vfs.addDirectory(`${cwd}/src/db/seeds`, (dir) => {
      dir.addFile("users.ts", "");
      dir.addFile("posts.ts", "");
    });

    const { mySyncCommand } = await import("./my-sync-command.js");
    const run = mySyncCommand.run;
    if (!run) throw new Error("run is undefined");

    await run({ args: { _: [], cwd }, rawArgs: [], cmd: mySyncCommand });

    // The command ran readdirSync against the VFS — assert on its side-effects.
    expect(vfs.existsSync(`${cwd}/src/db/seeds/users.ts`)).toBe(true);
  });
});
```

### When to use Pattern 2

Use Pattern 2 whenever the command:

- Calls synchronous `fs.*` methods (`readdirSync`, `existsSync`, `readFileSync`,
  `mkdirSync`, etc.) via its top-level `import fs from "node:fs"`.
- Uses destructured bindings that are resolved at import time:
  `const { readdirSync } = fs`.

Pattern 1 (VFS alone) is sufficient when the command only uses `fs.promises.*` —
those go through the same CJS object that VFS patches.

---

## Choosing between the two patterns

| Scenario                                             | Pattern                          |
| ---------------------------------------------------- | -------------------------------- |
| Command uses `fs.promises.*`                         | Pattern 1                        |
| Command uses sync `fs.*`                             | Pattern 2                        |
| Need a specific path to throw                        | `vi.doMock` the whole module     |
| Side effects outside the filesystem (spawn, network) | Retain `vi.mock` for that module |

---

## Key rules

1. **`vi.resetModules()` in `beforeEach`** — required so the dynamic `import()`
   picks up the current VFS state. Without it, the command's module is cached
   and the VFS bridge never fires.
2. **Mount before `vi.doMock`** — `vi.doMock`'s callback captures the CJS object
   at call time. If VFS is not yet mounted, the callback returns an un-patched
   object.
3. **Per-test subdirectories** — use `${MOUNT}/t${testIndex}` as `cwd` so files
   added for one test never bleed into another.
4. **`vfs.unmount()` in `afterEach`** — restores the original `node:fs` methods
   and ensures no state leaks between test files.
5. **`@scratchyjs/vfs` is a `devDependency`** — never add it to `dependencies`.
6. **VFS intercepts `fs.method()` calls, not pre-bound destructures** — if the
   command does `const { readFileSync } = require("node:fs")` at module level
   before `mount()` is called, those bindings escape the patch. The `vi.doMock`
   bridge (Pattern 2) works around this by giving the command a fresh import
   that uses the patched object for all property accesses.

---

## Anti-patterns

### ❌ Don't use `vi.mock("node:fs")` for CLI command tests

```typescript
// BAD — Hoisted static stub; disconnected from filesystem state.
vi.mock("node:fs/promises", () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}));

it("removes dist", async () => {
  await runCommand({ cwd: "/tmp/test" });
  expect(vi.mocked(fs.promises.rm)).toHaveBeenCalledWith(
    "/tmp/test/dist",
    expect.anything(),
  );
});

// GOOD — VFS pre-population + state assertion.
vfs.addDirectory(`${MOUNT}/dist`);
await runCommand({ cwd: MOUNT });
expect(vfs.existsSync(`${MOUNT}/dist`)).toBe(false);
```

### ❌ Don't call `vi.doMock` before `vfs.mount()`

```typescript
// BAD — VFS is not yet mounted; the CJS object is un-patched.
vi.doMock("node:fs", () => _require("node:fs"));
vfs = create();
vfs.mount(MOUNT);

// GOOD
vfs = create();
vfs.mount(MOUNT);
vi.doMock("node:fs", () => _require("node:fs"));
```

### ❌ Don't skip `vi.resetModules()` when using the bridge

```typescript
// BAD — The command's cached module bypasses the vi.doMock bridge.
beforeEach(() => {
  vfs = create();
  vfs.mount(MOUNT);
  vi.doMock("node:fs", () => _require("node:fs"));
});

// GOOD — resetModules() forces a fresh import after the bridge is installed.
beforeEach(() => {
  vi.resetModules();
  vfs = create();
  vfs.mount(MOUNT);
  vi.doMock("node:fs", () => _require("node:fs"));
});
```

### ❌ Don't forget to unmount VFS

```typescript
// BAD — node:fs stays patched for the next test file.
afterEach(() => {
  vi.restoreAllMocks();
  // vfs.unmount() missing!
});

// GOOD
afterEach(() => {
  vfs.unmount();
  vi.doUnmock("node:fs");
  vi.restoreAllMocks();
});
```

---

## Reference Links

- [Vitest Documentation](https://vitest.dev/)
- [Vitest `vi.doMock`](https://vitest.dev/api/vi.html#vi-domock)
- [`@scratchyjs/vfs` package](../../packages/vfs)
- [Fastify Testing — inject()](https://fastify.dev/docs/latest/Guides/Testing/)
- [docs/testing.md](../../docs/testing.md) — comprehensive testing guide
