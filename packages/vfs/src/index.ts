import { VirtualFileSystem } from "./file-system.js";
import type { VfsStats } from "./stats.js";

/**
 * `@scratchyjs/vfs` – Virtual File System for tests.
 *
 * A private, in-process virtual filesystem that monkey-patches `node:fs` so
 * that paths under a configured mount prefix are served from an in-memory
 * store instead of the real disk.  Drop-in replacement for `vi.mock('node:fs')`
 * in tests that need realistic filesystem interactions.
 *
 * @example Basic usage
 * ```ts
 * import { afterEach, beforeEach, it, expect } from "vitest";
 * import { create } from "@scratchyjs/vfs";
 * import fs from "node:fs";
 *
 * let vfs: ReturnType<typeof create>;
 *
 * beforeEach(() => {
 *   vfs = create();
 *   vfs.addFile("/config.json", JSON.stringify({ port: 3000 }));
 *   vfs.mount("/virtual");
 * });
 *
 * afterEach(() => vfs.unmount());
 *
 * it("reads the virtual config", () => {
 *   const raw = fs.readFileSync("/virtual/config.json", "utf8");
 *   expect(JSON.parse(raw)).toEqual({ port: 3000 });
 * });
 * ```
 *
 * @module @scratchyjs/vfs
 */

export { VirtualFileSystem } from "./file-system.js";
export { MemoryProvider } from "./memory-provider.js";

export type { VfsDirent } from "./memory-provider.js";
export type { VfsStats };

/**
 * Creates a new {@link VirtualFileSystem} instance backed by an in-memory
 * provider.
 *
 * @param options Optional configuration.
 * @param options.virtualCwd Enable virtual `process.cwd()` support (default `false`).
 * @param options.overlay Only intercept paths that already exist in the VFS (default `false`).
 */
export function create(options?: {
  virtualCwd?: boolean;
  overlay?: boolean;
}): VirtualFileSystem {
  return new VirtualFileSystem(options);
}
