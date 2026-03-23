/**
 * VirtualFileSystem – the public API wrapper for `@scratchyjs/vfs`.
 *
 * Ported from `lib/internal/vfs/file_system.js` in Node.js PR #61478.
 * Adapted for user-space TypeScript:
 *
 * - Mount/unmount is implemented via monkey-patching `node:fs` module
 *   properties rather than the C++-level `setVfsHandlers` hook used by the
 *   upstream Node.js PR.  This means the VFS intercepts calls made through
 *   the `fs` module object (e.g. `fs.readFileSync(path)`) but not calls made
 *   via a destructured local binding created before `mount()` was called
 *   (e.g. `const { readFileSync } = fs` followed by `readFileSync(path)`).
 *   For tests this trade-off is acceptable: callers written to use `fs.*`
 *   methods directly will be intercepted transparently.
 *
 * - `addFile` / `addDirectory` are convenience helpers for pre-populating
 *   the VFS in test setup, matching the ergonomics of the test-runner
 *   `MockFSContext` API described in the PR.
 *
 * - Uses `path.join` instead of string concatenation for path construction
 *   (per avivkeller review feedback on the upstream PR).
 */
import { createENOENT, createENOTDIR } from "./errors.js";
import type { VfsDirent } from "./memory-provider.js";
import { MemoryProvider } from "./memory-provider.js";
import { getRelativePath, isUnderMountPoint } from "./router.js";
import * as fsNamespace from "node:fs";
import { createRequire } from "node:module";
import { join, posix as pathPosix, resolve } from "node:path";

// Use `createRequire` to obtain a direct reference to the raw CJS exports
// object from `node:fs`.  This is mutable (properties are writable /
// configurable), whereas the ESM namespace object produced by
// `import * as fs from "node:fs"` exposes non-writable property bindings.
// Mutating this object patches `node:fs` for all callers that access it via
// `require("node:fs")` or `import fs from "node:fs"` — which is how most
// code (and `node:fs/promises`) accesses filesystem functions.
const _require = createRequire(import.meta.url);
const fs = _require("node:fs") as typeof fsNamespace;

/** Type alias for forwarding unknown-typed arguments to saved fs functions. */
type AnyFn = (...args: unknown[]) => unknown;

// ─── Types ────────────────────────────────────────────────────────────────────

interface VfsOptions {
  /** Whether to enable virtual working-directory support (default: false). */
  virtualCwd?: boolean;
  /** Whether to enable overlay mode – only intercept paths that exist in VFS (default: false). */
  overlay?: boolean;
}

interface WriteFileOptions {
  encoding?: BufferEncoding | null;
  mode?: number;
  flag?: string | number;
}

interface ReadFileOptions {
  encoding?: BufferEncoding | null;
  flag?: string | number;
}

interface ReaddirOptions {
  withFileTypes?: boolean;
  recursive?: boolean;
}

// ─── addDirectory populate helper ────────────────────────────────────────────

interface DirHelper {
  addFile(name: string, content: string | Buffer): void;
  addDirectory(name: string, populate?: (dir: DirHelper) => void): void;
}

function makeDirHelper(
  baseProvPath: string,
  provider: MemoryProvider,
): DirHelper {
  return {
    addFile: (name: string, content: string | Buffer) => {
      const p = pathPosix.join(baseProvPath, name);
      const buf = typeof content === "string" ? Buffer.from(content) : content;
      provider.writeFileSync(p, buf);
    },
    addDirectory: (name: string, populateChild?: (dir: DirHelper) => void) => {
      const p = pathPosix.join(baseProvPath, name);
      provider.mkdirSync(p, { recursive: true });
      if (typeof populateChild === "function") {
        populateChild(makeDirHelper(p, provider));
      }
    },
  };
}

// ─── Saved originals bucket ──────────────────────────────────────────────────

interface SavedFsMethods {
  existsSync: typeof fs.existsSync;
  readFileSync: typeof fs.readFileSync;
  writeFileSync: typeof fs.writeFileSync;
  appendFileSync: typeof fs.appendFileSync;
  statSync: typeof fs.statSync;
  lstatSync: typeof fs.lstatSync;
  readdirSync: typeof fs.readdirSync;
  mkdirSync: typeof fs.mkdirSync;
  rmdirSync: typeof fs.rmdirSync;
  rmSync: typeof fs.rmSync;
  unlinkSync: typeof fs.unlinkSync;
  renameSync: typeof fs.renameSync;
  copyFileSync: typeof fs.copyFileSync;
  symlinkSync: typeof fs.symlinkSync;
  chmodSync: typeof fs.chmodSync;
  chownSync: typeof fs.chownSync;
  utimesSync: typeof fs.utimesSync;
  realpathSync: typeof fs.realpathSync;
  readlinkSync: typeof fs.readlinkSync;
  accessSync: typeof fs.accessSync;
  mkdtempSync: typeof fs.mkdtempSync;
  truncateSync: typeof fs.truncateSync;
  linkSync: typeof fs.linkSync;
  promises: {
    readFile: typeof fs.promises.readFile;
    writeFile: typeof fs.promises.writeFile;
    appendFile: typeof fs.promises.appendFile;
    stat: typeof fs.promises.stat;
    lstat: typeof fs.promises.lstat;
    readdir: typeof fs.promises.readdir;
    mkdir: typeof fs.promises.mkdir;
    rmdir: typeof fs.promises.rmdir;
    rm: typeof fs.promises.rm;
    unlink: typeof fs.promises.unlink;
    rename: typeof fs.promises.rename;
    copyFile: typeof fs.promises.copyFile;
    symlink: typeof fs.promises.symlink;
    chmod: typeof fs.promises.chmod;
    chown: typeof fs.promises.chown;
    utimes: typeof fs.promises.utimes;
    realpath: typeof fs.promises.realpath;
    readlink: typeof fs.promises.readlink;
    access: typeof fs.promises.access;
    mkdtemp: typeof fs.promises.mkdtemp;
    truncate: typeof fs.promises.truncate;
    link: typeof fs.promises.link;
  };
}

// ─── VirtualFileSystem ────────────────────────────────────────────────────────

/**
 * A virtual file system backed by an in-memory provider.
 *
 * Typical test usage:
 *
 * ```ts
 * import { create } from "@scratchyjs/vfs";
 *
 * const vfs = create();
 * vfs.writeFileSync("/config.json", JSON.stringify({ port: 3000 }));
 * vfs.mount("/virtual");
 *
 * // From here on, code that calls fs.readFileSync("/virtual/config.json")
 * // will read from the in-memory VFS instead of the real filesystem.
 *
 * // … run the code under test …
 *
 * vfs.unmount(); // always unmount in afterEach / finally
 * ```
 */
export class VirtualFileSystem {
  readonly #provider: MemoryProvider;
  #mountPoint: string | null = null;
  #mounted = false;
  #overlay: boolean;
  #virtualCwdEnabled: boolean;
  #virtualCwd: string | null = null;
  #savedMethods: SavedFsMethods | null = null;
  #originalChdir: typeof process.chdir | null = null;
  #originalCwd: typeof process.cwd | null = null;

  constructor(options: VfsOptions = {}) {
    this.#provider = new MemoryProvider();
    this.#overlay = options.overlay === true;
    this.#virtualCwdEnabled = options.virtualCwd === true;
  }

  // ─── Metadata getters ──────────────────────────────────────────────────────

  get mountPoint(): string | null {
    return this.#mountPoint;
  }

  get mounted(): boolean {
    return this.#mounted;
  }

  get overlay(): boolean {
    return this.#overlay;
  }

  get virtualCwdEnabled(): boolean {
    return this.#virtualCwdEnabled;
  }

  // ─── Mount lifecycle ───────────────────────────────────────────────────────

  /**
   * Mounts the VFS at `prefix`, installing monkey-patches on `node:fs` that
   * route all paths starting with `prefix` through the in-memory provider.
   *
   * @param prefix Absolute path prefix under which the VFS is visible.
   * @returns `this` for method chaining.
   */
  mount(prefix: string): this {
    if (this.#mounted) {
      throw new Error("VFS is already mounted");
    }
    this.#mountPoint = resolve(prefix);
    this.#mounted = true;
    this.#installHooks();
    if (this.#virtualCwdEnabled) {
      this.#hookProcessCwd();
    }
    return this;
  }

  /**
   * Unmounts the VFS and restores the original `node:fs` methods.
   * Always call this in `afterEach` or a `finally` block.
   */
  unmount(): void {
    if (!this.#mounted) return;
    this.#restoreHooks();
    if (this.#virtualCwdEnabled) {
      this.#unhookProcessCwd();
    }
    this.#mountPoint = null;
    this.#mounted = false;
    this.#virtualCwd = null;
  }

  /** Dispose via `using` declaration (Explicit Resource Management). */
  [Symbol.dispose](): void {
    if (this.#mounted) this.unmount();
  }

  // ─── Virtual CWD ──────────────────────────────────────────────────────────

  /**
   * Returns the virtual current working directory, or `null` if not set.
   * Only available when `virtualCwd: true` was passed to `create()`.
   */
  cwd(): string | null {
    if (!this.#virtualCwdEnabled) {
      throw Object.assign(new Error("virtual cwd is not enabled"), {
        code: "ERR_INVALID_STATE",
      });
    }
    return this.#virtualCwd;
  }

  /**
   * Sets the virtual current working directory.
   * The path must exist in the VFS and be a directory.
   */
  chdir(dirPath: string): void {
    if (!this.#virtualCwdEnabled) {
      throw Object.assign(new Error("virtual cwd is not enabled"), {
        code: "ERR_INVALID_STATE",
      });
    }
    const providerPath = this.#toProviderPath(dirPath);
    const stats = this.#provider.statSync(providerPath);
    if (!stats.isDirectory()) throw createENOTDIR("chdir", dirPath);
    this.#virtualCwd = this.#toMountedPath(providerPath);
  }

  /**
   * Resolves `inputPath` relative to the virtual cwd when set;
   * otherwise behaves like `path.resolve`.
   */
  resolvePath(inputPath: string): string {
    if (inputPath.startsWith("/") || inputPath.match(/^[A-Za-z]:\\/)) {
      return resolve(inputPath);
    }
    if (this.#virtualCwdEnabled && this.#virtualCwd !== null) {
      return resolve(join(this.#virtualCwd, inputPath));
    }
    return resolve(inputPath);
  }

  // ─── Convenience helpers for test setup ───────────────────────────────────

  /**
   * Creates (or overwrites) a virtual file.
   *
   * Works both before and after `mount()`.  When called before mounting,
   * paths are provider-internal POSIX paths (e.g. `/src/index.ts`).  After
   * mounting, paths are interpreted relative to the mount prefix.
   */
  addFile(
    path: string,
    content: string | Buffer,
    options?: { mode?: number; encoding?: BufferEncoding },
  ): this {
    const buf =
      typeof content === "string"
        ? Buffer.from(content, options?.encoding ?? "utf8")
        : content;
    const provPath = this.#mounted
      ? this.#toProviderPath(path)
      : this.#normProviderPath(path);
    this.#provider.writeFileSync(provPath, buf);
    return this;
  }

  /**
   * Creates a virtual directory (recursively).
   *
   * An optional `populate` callback receives a scoped helper to add entries
   * inside the directory – mirroring the lazy-population pattern from the
   * upstream Node.js PR.
   */
  addDirectory(path: string, populate?: (dir: DirHelper) => void): this {
    const provPath = this.#mounted
      ? this.#toProviderPath(path)
      : this.#normProviderPath(path);
    this.#provider.mkdirSync(provPath, { recursive: true });
    if (typeof populate === "function") {
      populate(makeDirHelper(provPath, this.#provider));
    }
    return this;
  }

  // ─── Sync FS operations (delegating to the provider) ─────────────────────

  existsSync(path: string): boolean {
    try {
      const pp = this.#toProviderPath(path);
      return this.#provider.existsSync(pp);
    } catch {
      return false;
    }
  }

  statSync(path: string): ReturnType<MemoryProvider["statSync"]> {
    return this.#provider.statSync(this.#toProviderPath(path));
  }

  lstatSync(path: string): ReturnType<MemoryProvider["lstatSync"]> {
    return this.#provider.lstatSync(this.#toProviderPath(path));
  }

  readFileSync(
    path: string,
    options?: ReadFileOptions | BufferEncoding | null,
  ): Buffer | string {
    return this.#provider.readFileSync(this.#toProviderPath(path), options);
  }

  writeFileSync(
    path: string,
    data: string | Buffer | Uint8Array,
    options?: WriteFileOptions | BufferEncoding | null,
  ): void {
    this.#provider.writeFileSync(this.#toProviderPath(path), data, options);
  }

  appendFileSync(
    path: string,
    data: string | Buffer | Uint8Array,
    options?: WriteFileOptions | BufferEncoding | null,
  ): void {
    this.#provider.appendFileSync(this.#toProviderPath(path), data, options);
  }

  readdirSync(path: string, options?: ReaddirOptions): string[] | VfsDirent[] {
    return this.#provider.readdirSync(this.#toProviderPath(path), options);
  }

  mkdirSync(
    path: string,
    options?: { recursive?: boolean; mode?: number },
  ): string | undefined {
    const result = this.#provider.mkdirSync(
      this.#toProviderPath(path),
      options,
    );
    if (result !== undefined) return this.#toMountedPath(result);
    return undefined;
  }

  rmdirSync(path: string): void {
    this.#provider.rmdirSync(this.#toProviderPath(path));
  }

  rmSync(
    path: string,
    options?: { recursive?: boolean; force?: boolean },
  ): void {
    this.#provider.rmSync(this.#toProviderPath(path), options);
  }

  unlinkSync(path: string): void {
    this.#provider.unlinkSync(this.#toProviderPath(path));
  }

  renameSync(oldPath: string, newPath: string): void {
    this.#provider.renameSync(
      this.#toProviderPath(oldPath),
      this.#toProviderPath(newPath),
    );
  }

  copyFileSync(src: string, dest: string): void {
    this.#provider.copyFileSync(
      this.#toProviderPath(src),
      this.#toProviderPath(dest),
    );
  }

  symlinkSync(target: string, path: string): void {
    const providerTarget = pathPosix.isAbsolute(target)
      ? this.#toProviderPath(target)
      : target;
    this.#provider.symlinkSync(providerTarget, this.#toProviderPath(path));
  }

  readlinkSync(path: string): string {
    const result = this.#provider.readlinkSync(this.#toProviderPath(path));
    return pathPosix.isAbsolute(result)
      ? this.#toMountedPath(result)
      : result;
  }

  realpathSync(path: string): string {
    const result = this.#provider.realpathSync(this.#toProviderPath(path));
    return this.#toMountedPath(result);
  }

  accessSync(path: string, mode?: number): void {
    this.#provider.accessSync(this.#toProviderPath(path), mode);
  }

  chmodSync(path: string, mode: string | number): void {
    this.#provider.chmodSync(this.#toProviderPath(path), mode);
  }

  chownSync(path: string, uid: number, gid: number): void {
    this.#provider.chownSync(this.#toProviderPath(path), uid, gid);
  }

  utimesSync(path: string, atime: number | Date, mtime: number | Date): void {
    this.#provider.utimesSync(this.#toProviderPath(path), atime, mtime);
  }

  mkdtempSync(prefix: string): string {
    const result = this.#provider.mkdtempSync(this.#toProviderPath(prefix));
    return this.#toMountedPath(result);
  }

  truncateSync(path: string, len?: number): void {
    this.#provider.truncateSync(this.#toProviderPath(path), len);
  }

  linkSync(existingPath: string, newPath: string): void {
    this.#provider.linkSync(
      this.#toProviderPath(existingPath),
      this.#toProviderPath(newPath),
    );
  }

  // ─── Promises ─────────────────────────────────────────────────────────────

  /** Async equivalents of all sync operations. */
  get promises(): {
    readFile(
      path: string,
      options?: ReadFileOptions | BufferEncoding | null,
    ): Promise<Buffer | string>;
    writeFile(
      path: string,
      data: string | Buffer | Uint8Array,
      options?: WriteFileOptions | BufferEncoding | null,
    ): Promise<void>;
    appendFile(
      path: string,
      data: string | Buffer | Uint8Array,
      options?: WriteFileOptions | BufferEncoding | null,
    ): Promise<void>;
    stat(path: string): Promise<ReturnType<MemoryProvider["statSync"]>>;
    lstat(path: string): Promise<ReturnType<MemoryProvider["lstatSync"]>>;
    readdir(
      path: string,
      options?: ReaddirOptions,
    ): Promise<string[] | VfsDirent[]>;
    mkdir(
      path: string,
      options?: { recursive?: boolean; mode?: number },
    ): Promise<string | undefined>;
    rmdir(path: string): Promise<void>;
    rm(
      path: string,
      options?: { recursive?: boolean; force?: boolean },
    ): Promise<void>;
    unlink(path: string): Promise<void>;
    rename(oldPath: string, newPath: string): Promise<void>;
    copyFile(src: string, dest: string): Promise<void>;
    symlink(target: string, path: string): Promise<void>;
    readlink(path: string): Promise<string>;
    realpath(path: string): Promise<string>;
    access(path: string, mode?: number): Promise<void>;
    chmod(path: string, mode: string | number): Promise<void>;
    chown(path: string, uid: number, gid: number): Promise<void>;
    utimes(
      path: string,
      atime: number | Date,
      mtime: number | Date,
    ): Promise<void>;
    mkdtemp(prefix: string): Promise<string>;
    truncate(path: string, len?: number): Promise<void>;
    link(existingPath: string, newPath: string): Promise<void>;
  } {
    return {
      readFile: (p, o) => this.#provider.readFile(this.#toProviderPath(p), o),
      writeFile: (p, d, o) =>
        this.#provider.writeFile(this.#toProviderPath(p), d, o),
      appendFile: (p, d, o) =>
        this.#provider.appendFile(this.#toProviderPath(p), d, o),
      stat: (p) => this.#provider.stat(this.#toProviderPath(p)),
      lstat: (p) => this.#provider.lstat(this.#toProviderPath(p)),
      readdir: (p, o) => this.#provider.readdir(this.#toProviderPath(p), o),
      mkdir: async (p, o) => {
        const result = await this.#provider.mkdir(this.#toProviderPath(p), o);
        return result !== undefined ? this.#toMountedPath(result) : undefined;
      },
      rmdir: (p) => this.#provider.rmdir(this.#toProviderPath(p)),
      rm: (p, o) => this.#provider.rm(this.#toProviderPath(p), o),
      unlink: (p) => this.#provider.unlink(this.#toProviderPath(p)),
      rename: (o, n) =>
        this.#provider.rename(this.#toProviderPath(o), this.#toProviderPath(n)),
      copyFile: (s, d) =>
        this.#provider.copyFile(
          this.#toProviderPath(s),
          this.#toProviderPath(d),
        ),
      symlink: (t, p) => this.#provider.symlink(t, this.#toProviderPath(p)),
      readlink: (p) =>
        Promise.resolve(this.#provider.readlinkSync(this.#toProviderPath(p))),
      realpath: async (p) =>
        this.#toMountedPath(
          this.#provider.realpathSync(this.#toProviderPath(p)),
        ),
      access: (p, m) => {
        this.#provider.accessSync(this.#toProviderPath(p), m);
        return Promise.resolve();
      },
      chmod: (p, m) => this.#provider.chmod(this.#toProviderPath(p), m),
      chown: (p, u, g) => this.#provider.chown(this.#toProviderPath(p), u, g),
      utimes: (p, a, t) => {
        this.#provider.utimesSync(this.#toProviderPath(p), a, t);
        return Promise.resolve();
      },
      mkdtemp: async (p) =>
        this.#toMountedPath(
          await this.#provider.mkdtemp(this.#toProviderPath(p)),
        ),
      truncate: (p, l) => this.#provider.truncate(this.#toProviderPath(p), l),
      link: (e, n) =>
        this.#provider.link(this.#toProviderPath(e), this.#toProviderPath(n)),
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /** Returns `true` when an absolute path should be handled by this VFS. */
  #shouldHandle(inputPath: string): boolean {
    if (!this.#mounted || !this.#mountPoint) return false;
    const normalized = resolve(inputPath);
    if (!isUnderMountPoint(normalized, this.#mountPoint)) return false;
    if (this.#overlay) {
      try {
        return this.#provider.existsSync(
          getRelativePath(normalized, this.#mountPoint),
        );
      } catch {
        return false;
      }
    }
    return true;
  }

  /** Translates an absolute mounted path to a provider-internal path. */
  #toProviderPath(inputPath: string): string {
    if (this.#mounted && this.#mountPoint) {
      const resolved = resolve(inputPath);
      if (isUnderMountPoint(resolved, this.#mountPoint)) {
        return getRelativePath(resolved, this.#mountPoint);
      }
      throw createENOENT("open", inputPath);
    }
    return this.#normProviderPath(inputPath);
  }

  /** Translates a provider-internal path to the mounted absolute path. */
  #toMountedPath(providerPath: string): string {
    if (this.#mounted && this.#mountPoint) {
      // Ensure `providerPath` is treated as relative when joining so that
      // `this.#mountPoint` is not discarded even if `providerPath` is
      // absolute (starts with `/` or `\`).
      const relativeProviderPath = providerPath.replace(/^[/\\]+/, "");
      return join(this.#mountPoint, relativeProviderPath);
    }
    return providerPath;
  }

  /** Normalises a pre-mount provider path to POSIX format. */
  #normProviderPath(p: string): string {
    return "/" + p.replace(/\\/g, "/").replace(/^\/+/, "");
  }

  // ─── Monkey-patching ──────────────────────────────────────────────────────

  #installHooks(): void {
    const saved: SavedFsMethods = {
      existsSync: fs.existsSync,
      readFileSync: fs.readFileSync,
      writeFileSync: fs.writeFileSync,
      appendFileSync: fs.appendFileSync,
      statSync: fs.statSync,
      lstatSync: fs.lstatSync,
      readdirSync: fs.readdirSync,
      mkdirSync: fs.mkdirSync,
      rmdirSync: fs.rmdirSync,
      rmSync: fs.rmSync,
      unlinkSync: fs.unlinkSync,
      renameSync: fs.renameSync,
      copyFileSync: fs.copyFileSync,
      symlinkSync: fs.symlinkSync,
      chmodSync: fs.chmodSync,
      chownSync: fs.chownSync,
      utimesSync: fs.utimesSync,
      realpathSync: fs.realpathSync,
      readlinkSync: fs.readlinkSync,
      accessSync: fs.accessSync,
      mkdtempSync: fs.mkdtempSync,
      truncateSync: fs.truncateSync,
      linkSync: fs.linkSync,
      promises: {
        readFile: fs.promises.readFile,
        writeFile: fs.promises.writeFile,
        appendFile: fs.promises.appendFile,
        stat: fs.promises.stat,
        lstat: fs.promises.lstat,
        readdir: fs.promises.readdir,
        mkdir: fs.promises.mkdir,
        rmdir: fs.promises.rmdir,
        rm: fs.promises.rm,
        unlink: fs.promises.unlink,
        rename: fs.promises.rename,
        copyFile: fs.promises.copyFile,
        symlink: fs.promises.symlink,
        chmod: fs.promises.chmod,
        chown: fs.promises.chown,
        utimes: fs.promises.utimes,
        realpath: fs.promises.realpath,
        readlink: fs.promises.readlink,
        access: fs.promises.access,
        mkdtemp: fs.promises.mkdtemp,
        truncate: fs.promises.truncate,
        link: fs.promises.link,
      },
    };
    this.#savedMethods = saved;

    // Obtain a mutable reference to the fs module (typed as a record so that
    // individual method replacements below don't require per-line eslint-disable
    // comments for the `any` cast).
    const fsMut = fs as unknown as Record<string, AnyFn>;
    const promMut = fs.promises as unknown as Record<string, AnyFn>;

    // ── Sync methods ────────────────────────────────────────────────────────
    fsMut.existsSync = (p: unknown) =>
      typeof p === "string" && this.#shouldHandle(p)
        ? this.#provider.existsSync(this.#toProviderPath(p))
        : saved.existsSync(p as string);

    fsMut.readFileSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.readFileSync(
          this.#toProviderPath(p),
          opts as ReadFileOptions | BufferEncoding | null,
        );
      }
      return (saved.readFileSync as AnyFn)(p, opts);
    };

    fsMut.writeFileSync = (p: unknown, data: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        this.#provider.writeFileSync(
          this.#toProviderPath(p),
          data as string | Buffer,
          opts as WriteFileOptions | BufferEncoding | null,
        );
        return;
      }
      return (saved.writeFileSync as AnyFn)(p, data, opts);
    };

    fsMut.appendFileSync = (p: unknown, data: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        this.#provider.appendFileSync(
          this.#toProviderPath(p),
          data as string | Buffer,
          opts as WriteFileOptions | BufferEncoding | null,
        );
        return;
      }
      return (saved.appendFileSync as AnyFn)(p, data, opts);
    };

    fsMut.statSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.statSync(this.#toProviderPath(p));
      }
      return (saved.statSync as AnyFn)(p, opts);
    };

    fsMut.lstatSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.lstatSync(this.#toProviderPath(p));
      }
      return (saved.lstatSync as AnyFn)(p, opts);
    };

    fsMut.readdirSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.readdirSync(
          this.#toProviderPath(p),
          opts as ReaddirOptions,
        );
      }
      return (saved.readdirSync as AnyFn)(p, opts);
    };

    fsMut.mkdirSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        const result = this.#provider.mkdirSync(
          this.#toProviderPath(p),
          opts as { recursive?: boolean; mode?: number },
        );
        return result !== undefined ? this.#toMountedPath(result) : undefined;
      }
      return (saved.mkdirSync as AnyFn)(p, opts);
    };

    fsMut.rmdirSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.rmdirSync(this.#toProviderPath(p));
      }
      return (saved.rmdirSync as AnyFn)(p, opts);
    };

    fsMut.rmSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.rmSync(
          this.#toProviderPath(p),
          opts as { recursive?: boolean; force?: boolean },
        );
      }
      return (saved.rmSync as AnyFn)(p, opts);
    };

    fsMut.unlinkSync = (p: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.unlinkSync(this.#toProviderPath(p));
      }
      return (saved.unlinkSync as AnyFn)(p);
    };

    fsMut.renameSync = (oldP: unknown, newP: unknown) => {
      if (typeof oldP === "string" && this.#shouldHandle(oldP)) {
        return this.#provider.renameSync(
          this.#toProviderPath(oldP),
          this.#toProviderPath(newP as string),
        );
      }
      return (saved.renameSync as AnyFn)(oldP, newP);
    };

    fsMut.copyFileSync = (src: unknown, dest: unknown, mode?: unknown) => {
      if (typeof src === "string" && typeof dest === "string") {
        const srcHandled = this.#shouldHandle(src);
        const destHandled = this.#shouldHandle(dest);

        if (srcHandled && destHandled) {
          return this.#provider.copyFileSync(
            this.#toProviderPath(src),
            this.#toProviderPath(dest),
          );
        }

        if (srcHandled !== destHandled) {
          const err = new Error("Cross-device link not permitted") as NodeJS.ErrnoException;
          err.code = "EXDEV";
          throw err;
        }
      }
      return (saved.copyFileSync as AnyFn)(src, dest, mode);
    };

    fsMut.symlinkSync = (target: unknown, p: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.symlinkSync(
          target as string,
          this.#toProviderPath(p),
        );
      }
      return (saved.symlinkSync as AnyFn)(target, p);
    };

    fsMut.chmodSync = (p: unknown, mode: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.chmodSync(
          this.#toProviderPath(p),
          mode as string | number,
        );
      }
      return (saved.chmodSync as AnyFn)(p, mode);
    };

    fsMut.chownSync = (p: unknown, uid: unknown, gid: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.chownSync(
          this.#toProviderPath(p),
          uid as number,
          gid as number,
        );
      }
      return (saved.chownSync as AnyFn)(p, uid, gid);
    };

    fsMut.utimesSync = (p: unknown, atime: unknown, mtime: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.utimesSync(
          this.#toProviderPath(p),
          atime as number | Date,
          mtime as number | Date,
        );
      }
      return (saved.utimesSync as AnyFn)(p, atime, mtime);
    };

    fsMut.realpathSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#toMountedPath(
          this.#provider.realpathSync(this.#toProviderPath(p)),
        );
      }
      return (saved.realpathSync as AnyFn)(p, opts);
    };

    fsMut.readlinkSync = (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.readlinkSync(this.#toProviderPath(p));
      }
      return (saved.readlinkSync as AnyFn)(p, opts);
    };

    fsMut.accessSync = (p: unknown, mode?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.accessSync(
          this.#toProviderPath(p),
          mode as number | undefined,
        );
      }
      return (saved.accessSync as AnyFn)(p, mode);
    };

    fsMut.mkdtempSync = (prefix: unknown, opts?: unknown) => {
      if (typeof prefix === "string" && this.#shouldHandle(prefix)) {
        return this.#toMountedPath(
          this.#provider.mkdtempSync(this.#toProviderPath(prefix)),
        );
      }
      return (saved.mkdtempSync as AnyFn)(prefix, opts);
    };

    fsMut.truncateSync = (p: unknown, len?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.truncateSync(
          this.#toProviderPath(p),
          len as number | undefined,
        );
      }
      return (saved.truncateSync as AnyFn)(p, len);
    };

    fsMut.linkSync = (existing: unknown, newP: unknown) => {
      if (typeof existing === "string" && this.#shouldHandle(existing)) {
        return this.#provider.linkSync(
          this.#toProviderPath(existing),
          this.#toProviderPath(newP as string),
        );
      }
      return (saved.linkSync as AnyFn)(existing, newP);
    };

    // ── Promise methods ─────────────────────────────────────────────────────

    promMut.readFile = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.readFile(
          this.#toProviderPath(p),
          opts as ReadFileOptions | BufferEncoding | null,
        );
      }
      return (saved.promises.readFile as AnyFn)(p, opts);
    };

    promMut.writeFile = async (p: unknown, data: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.writeFile(
          this.#toProviderPath(p),
          data as string | Buffer,
          opts as WriteFileOptions | BufferEncoding | null,
        );
      }
      return (saved.promises.writeFile as AnyFn)(p, data, opts);
    };

    promMut.appendFile = async (p: unknown, data: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.appendFile(
          this.#toProviderPath(p),
          data as string | Buffer,
          opts as WriteFileOptions | BufferEncoding | null,
        );
      }
      return (saved.promises.appendFile as AnyFn)(p, data, opts);
    };

    promMut.stat = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.stat(this.#toProviderPath(p));
      }
      return (saved.promises.stat as AnyFn)(p, opts);
    };

    promMut.lstat = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.lstat(this.#toProviderPath(p));
      }
      return (saved.promises.lstat as AnyFn)(p, opts);
    };

    promMut.readdir = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.readdir(
          this.#toProviderPath(p),
          opts as ReaddirOptions,
        );
      }
      return (saved.promises.readdir as AnyFn)(p, opts);
    };

    promMut.mkdir = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        const result = await this.#provider.mkdir(
          this.#toProviderPath(p),
          opts as { recursive?: boolean; mode?: number },
        );
        return result !== undefined ? this.#toMountedPath(result) : undefined;
      }
      return (saved.promises.mkdir as AnyFn)(p, opts);
    };

    promMut.rmdir = async (p: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.rmdir(this.#toProviderPath(p));
      }
      return (saved.promises.rmdir as AnyFn)(p);
    };

    promMut.rm = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.rm(
          this.#toProviderPath(p),
          opts as { recursive?: boolean; force?: boolean },
        );
      }
      return (saved.promises.rm as AnyFn)(p, opts);
    };

    promMut.unlink = async (p: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.unlink(this.#toProviderPath(p));
      }
      return (saved.promises.unlink as AnyFn)(p);
    };

    promMut.rename = async (oldP: unknown, newP: unknown) => {
      if (typeof oldP === "string" && this.#shouldHandle(oldP)) {
        return this.#provider.rename(
          this.#toProviderPath(oldP),
          this.#toProviderPath(newP as string),
        );
      }
      return (saved.promises.rename as AnyFn)(oldP, newP);
    };

    promMut.copyFile = async (src: unknown, dest: unknown) => {
      if (typeof src === "string" && this.#shouldHandle(src)) {
        return this.#provider.copyFile(
          this.#toProviderPath(src),
          this.#toProviderPath(dest as string),
        );
      }
      return (saved.promises.copyFile as AnyFn)(src, dest);
    };

    promMut.symlink = async (target: unknown, p: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        const internalTarget =
          typeof target === "string" && this.#shouldHandle(target)
            ? this.#toProviderPath(target)
            : (target as string);
        return this.#provider.symlink(
          internalTarget,
          this.#toProviderPath(p),
        );
      }
      return (saved.promises.symlink as AnyFn)(target, p);
    };

    promMut.chmod = async (p: unknown, mode: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.chmod(
          this.#toProviderPath(p),
          mode as string | number,
        );
      }
      return (saved.promises.chmod as AnyFn)(p, mode);
    };

    promMut.chown = async (p: unknown, uid: unknown, gid: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.chown(
          this.#toProviderPath(p),
          uid as number,
          gid as number,
        );
      }
      return (saved.promises.chown as AnyFn)(p, uid, gid);
    };

    promMut.utimes = async (p: unknown, atime: unknown, mtime: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        this.#provider.utimesSync(
          this.#toProviderPath(p),
          atime as number | Date,
          mtime as number | Date,
        );
        return;
      }
      return (saved.promises.utimes as AnyFn)(p, atime, mtime);
    };

    promMut.realpath = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#toMountedPath(
          this.#provider.realpathSync(this.#toProviderPath(p)),
        );
      }
      return (saved.promises.realpath as AnyFn)(p, opts);
    };

    promMut.readlink = async (p: unknown, opts?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.readlinkSync(this.#toProviderPath(p));
      }
      return (saved.promises.readlink as AnyFn)(p, opts);
    };

    promMut.access = async (p: unknown, mode?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        this.#provider.accessSync(
          this.#toProviderPath(p),
          mode as number | undefined,
        );
        return;
      }
      return (saved.promises.access as AnyFn)(p, mode);
    };

    promMut.mkdtemp = async (prefix: unknown, opts?: unknown) => {
      if (typeof prefix === "string" && this.#shouldHandle(prefix)) {
        return this.#toMountedPath(
          await this.#provider.mkdtemp(this.#toProviderPath(prefix)),
        );
      }
      return (saved.promises.mkdtemp as AnyFn)(prefix, opts);
    };

    promMut.truncate = async (p: unknown, len?: unknown) => {
      if (typeof p === "string" && this.#shouldHandle(p)) {
        return this.#provider.truncate(
          this.#toProviderPath(p),
          len as number | undefined,
        );
      }
      return (saved.promises.truncate as AnyFn)(p, len);
    };

    promMut.link = async (existing: unknown, newP: unknown) => {
      if (typeof existing === "string" && this.#shouldHandle(existing)) {
        return this.#provider.link(
          this.#toProviderPath(existing),
          this.#toProviderPath(newP as string),
        );
      }
      return (saved.promises.link as AnyFn)(existing, newP);
    };
  }

  #restoreHooks(): void {
    if (!this.#savedMethods) return;
    const saved = this.#savedMethods;

    const fsMut = fs as unknown as Record<string, unknown>;
    fsMut.existsSync = saved.existsSync;
    fsMut.readFileSync = saved.readFileSync;
    fsMut.writeFileSync = saved.writeFileSync;
    fsMut.appendFileSync = saved.appendFileSync;
    fsMut.statSync = saved.statSync;
    fsMut.lstatSync = saved.lstatSync;
    fsMut.readdirSync = saved.readdirSync;
    fsMut.mkdirSync = saved.mkdirSync;
    fsMut.rmdirSync = saved.rmdirSync;
    fsMut.rmSync = saved.rmSync;
    fsMut.unlinkSync = saved.unlinkSync;
    fsMut.renameSync = saved.renameSync;
    fsMut.copyFileSync = saved.copyFileSync;
    fsMut.symlinkSync = saved.symlinkSync;
    fsMut.chmodSync = saved.chmodSync;
    fsMut.chownSync = saved.chownSync;
    fsMut.utimesSync = saved.utimesSync;
    fsMut.realpathSync = saved.realpathSync;
    fsMut.readlinkSync = saved.readlinkSync;
    fsMut.accessSync = saved.accessSync;
    fsMut.mkdtempSync = saved.mkdtempSync;
    fsMut.truncateSync = saved.truncateSync;
    fsMut.linkSync = saved.linkSync;

    const promMut = fs.promises as unknown as Record<string, unknown>;
    promMut.readFile = saved.promises.readFile;
    promMut.writeFile = saved.promises.writeFile;
    promMut.appendFile = saved.promises.appendFile;
    promMut.stat = saved.promises.stat;
    promMut.lstat = saved.promises.lstat;
    promMut.readdir = saved.promises.readdir;
    promMut.mkdir = saved.promises.mkdir;
    promMut.rmdir = saved.promises.rmdir;
    promMut.rm = saved.promises.rm;
    promMut.unlink = saved.promises.unlink;
    promMut.rename = saved.promises.rename;
    promMut.copyFile = saved.promises.copyFile;
    promMut.symlink = saved.promises.symlink;
    promMut.chmod = saved.promises.chmod;
    promMut.chown = saved.promises.chown;
    promMut.utimes = saved.promises.utimes;
    promMut.realpath = saved.promises.realpath;
    promMut.readlink = saved.promises.readlink;
    promMut.access = saved.promises.access;
    promMut.mkdtemp = saved.promises.mkdtemp;
    promMut.truncate = saved.promises.truncate;
    promMut.link = saved.promises.link;

    this.#savedMethods = null;
  }

  // ─── process.cwd / process.chdir hooks ────────────────────────────────────

  #hookProcessCwd(): void {
    if (this.#originalChdir !== null) return;

    this.#originalChdir = process.chdir;
    this.#originalCwd = process.cwd;

    // Capture the saved originals in local constants (guaranteed non-null here)
    // so that arrow functions below can call them without a non-null assertion.
    const savedChdir = this.#originalChdir;
    const savedCwd = this.#originalCwd;

    process.chdir = (directory: string): void => {
      const normalized = resolve(directory);
      if (this.#shouldHandle(normalized)) {
        this.chdir(normalized);
        return;
      }
      savedChdir.call(process, directory);
    };

    process.cwd = (): string => {
      if (this.#virtualCwd !== null) {
        return this.#virtualCwd;
      }
      return savedCwd.call(process);
    };
  }

  #unhookProcessCwd(): void {
    if (this.#originalChdir === null) return;
    process.chdir = this.#originalChdir;
    if (this.#originalCwd !== null) {
      process.cwd = this.#originalCwd;
    }
    this.#originalChdir = null;
    this.#originalCwd = null;
  }
}
