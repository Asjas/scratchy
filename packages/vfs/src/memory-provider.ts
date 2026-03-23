/**
 * In-memory filesystem provider.
 *
 * Ported from `lib/internal/vfs/providers/memory.js` in Node.js PR #61478.
 * Adapted for user-space TypeScript (no `primordials`, no `internalBinding`).
 *
 * Key changes versus the upstream source:
 * - Uses `path.posix` instead of primordials equivalents.
 * - Error helpers come from `./errors.ts` (standard `Error` objects).
 * - Stats objects come from `./stats.ts` (custom `VfsStats` class).
 * - Uses `path.join` instead of string concatenation (avivkeller feedback).
 */
import {
  createEACCES,
  createEEXIST,
  createEINVAL,
  createEISDIR,
  createELOOP,
  createENOENT,
  createENOTDIR,
  createENOTEMPTY,
  createEROFS,
} from "./errors.js";
import type { VfsStats } from "./stats.js";
import {
  createDirectoryStats,
  createFileStats,
  createSymlinkStats,
} from "./stats.js";
import { posix as pathPosix } from "node:path";

// ─── Entry types ────────────────────────────────────────────────────────────

const TYPE_FILE = 0;
const TYPE_DIR = 1;
const TYPE_SYMLINK = 2;

const MAX_SYMLINK_DEPTH = 40;

// ─── Internal entry ─────────────────────────────────────────────────────────

interface EntryOptions {
  mode?: number;
}

class MemoryEntry {
  type: number;
  mode: number;
  content: Buffer | null = null;
  target: string | null = null; // symlink target
  children: Map<string, MemoryEntry> | null = null;
  populate: ((scoped: ScopedVfs) => void) | null = null;
  populated = true;
  nlink = 1;
  uid = 0;
  gid = 0;
  atime: number;
  mtime: number;
  ctime: number;
  birthtime: number;

  constructor(type: number, options: EntryOptions = {}) {
    this.type = type;
    this.mode = options.mode ?? (type === TYPE_DIR ? 0o755 : 0o644);
    const now = Date.now();
    this.atime = now;
    this.mtime = now;
    this.ctime = now;
    this.birthtime = now;
  }

  isFile(): boolean {
    return this.type === TYPE_FILE;
  }
  isDirectory(): boolean {
    return this.type === TYPE_DIR;
  }
  isSymbolicLink(): boolean {
    return this.type === TYPE_SYMLINK;
  }
}

// ─── Guard helpers ───────────────────────────────────────────────────────────

/**
 * Returns the children map of a directory entry, throwing `ENOTDIR` if the
 * entry is not a directory or has not been initialised.
 */
function getChildren(
  entry: MemoryEntry,
  syscall: string,
  path: string,
): Map<string, MemoryEntry> {
  /* istanbul ignore next -- defensive guard: callers verify isDirectory() first */
  if (!entry.children) {
    throw createENOTDIR(syscall, path);
  }
  return entry.children;
}

/**
 * Returns the symlink target string, throwing `EINVAL` if it is null.
 */
function getTarget(entry: MemoryEntry, syscall: string, path: string): string {
  /* istanbul ignore next -- defensive guard: callers verify isSymbolicLink() first */
  if (entry.target === null) {
    throw createEINVAL(syscall, path);
  }
  return entry.target;
}

// ─── Scoped VFS (for lazy directory population) ─────────────────────────────

interface ScopedVfs {
  addFile(name: string, content: string | Buffer, opts?: EntryOptions): void;
  addDirectory(
    name: string,
    populate?: (s: ScopedVfs) => void,
    opts?: EntryOptions,
  ): void;
  addSymlink(name: string, target: string, opts?: EntryOptions): void;
}

// ─── Dirent-like object ─────────────────────────────────────────────────────

export class VfsDirent {
  readonly name: string;
  readonly path: string;
  readonly #type: number;

  constructor(name: string, type: number, parentPath: string) {
    this.name = name;
    this.#type = type;
    this.path = parentPath;
  }

  isFile(): boolean {
    return this.#type === TYPE_FILE;
  }
  isDirectory(): boolean {
    return this.#type === TYPE_DIR;
  }
  isSymbolicLink(): boolean {
    return this.#type === TYPE_SYMLINK;
  }
  isBlockDevice(): boolean {
    return false;
  }
  isCharacterDevice(): boolean {
    return false;
  }
  isFIFO(): boolean {
    return false;
  }
  isSocket(): boolean {
    return false;
  }
}

// ─── Options interfaces ──────────────────────────────────────────────────────

interface ReaddirOptions {
  withFileTypes?: boolean;
  recursive?: boolean;
  encoding?: BufferEncoding | "buffer";
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

// ─── MemoryProvider ─────────────────────────────────────────────────────────

/**
 * A complete, in-memory filesystem.  Paths are always POSIX-style (starting
 * with `/`) and are relative to the provider's own root, **not** to any
 * mount point.  Mount-point translation is handled by `VirtualFileSystem`.
 */
export class MemoryProvider {
  readonly #root: MemoryEntry;
  #readonly = false;

  constructor() {
    this.#root = new MemoryEntry(TYPE_DIR);
    this.#root.children = new Map();
  }

  get readonly(): boolean {
    return this.#readonly;
  }

  /** Freeze the provider so no further writes are accepted. */
  setReadOnly(): void {
    this.#readonly = true;
  }

  // ── Path helpers ────────────────────────────────────────────────────────

  #normalizePath(p: string): string {
    let normalized = p.replace(/\\/g, "/");
    if (!normalized.startsWith("/")) normalized = "/" + normalized;
    return pathPosix.normalize(normalized);
  }

  #splitPath(p: string): string[] {
    if (p === "/") return [];
    return p.slice(1).split("/");
  }

  #resolveSymlinkTarget(symlinkPath: string, target: string): string {
    if (target.startsWith("/")) return this.#normalizePath(target);
    const parentPath = pathPosix.dirname(symlinkPath);
    return this.#normalizePath(pathPosix.join(parentPath, target));
  }

  // ── Entry lookup ────────────────────────────────────────────────────────

  #lookupEntry(
    p: string,
    followSymlinks = true,
    depth = 0,
  ): {
    entry: MemoryEntry | null;
    resolvedPath: string | null;
    eloop?: boolean;
  } {
    const normalized = this.#normalizePath(p);

    if (normalized === "/") {
      return { entry: this.#root, resolvedPath: "/" };
    }

    const segments = this.#splitPath(normalized);
    let current = this.#root;
    let currentPath = "/";

    for (const segment of segments) {
      if (current.isSymbolicLink()) {
        if (depth >= MAX_SYMLINK_DEPTH) {
          return { entry: null, resolvedPath: null, eloop: true };
        }
        const target = current.target ?? "";
        const targetPath = this.#resolveSymlinkTarget(currentPath, target);
        const result = this.#lookupEntry(targetPath, true, depth + 1);
        if (result.eloop) return result;
        if (!result.entry || !result.resolvedPath) {
          return { entry: null, resolvedPath: null };
        }
        current = result.entry;
        currentPath = result.resolvedPath;
      }

      if (!current.isDirectory()) {
        return { entry: null, resolvedPath: null };
      }

      this.#ensurePopulated(current);

      const children = current.children;
      if (!children) return { entry: null, resolvedPath: null };
      const entry = children.get(segment);
      if (!entry) return { entry: null, resolvedPath: null };

      currentPath = pathPosix.join(currentPath, segment);
      current = entry;
    }

    if (current.isSymbolicLink() && followSymlinks) {
      if (depth >= MAX_SYMLINK_DEPTH) {
        return { entry: null, resolvedPath: null, eloop: true };
      }
      const target = current.target ?? "";
      const targetPath = this.#resolveSymlinkTarget(currentPath, target);
      return this.#lookupEntry(targetPath, true, depth + 1);
    }

    return { entry: current, resolvedPath: currentPath };
  }

  #getEntry(p: string, syscall: string, followSymlinks = true): MemoryEntry {
    const result = this.#lookupEntry(p, followSymlinks);
    if (result.eloop) throw createELOOP(syscall, p);
    if (!result.entry) throw createENOENT(syscall, p);
    return result.entry;
  }

  #ensureParent(
    p: string,
    createMissing: boolean,
    syscall: string,
  ): MemoryEntry {
    if (p === "/") return this.#root;

    const parentPath = pathPosix.dirname(p);
    const segments = this.#splitPath(parentPath);
    let current = this.#root;

    for (let i = 0; i < segments.length; i++) {
      const segment = segments[i];
      if (segment === undefined) break;

      if (current.isSymbolicLink()) {
        const cp = "/" + segments.slice(0, i).join("/");
        const target = current.target ?? "";
        const targetPath = this.#resolveSymlinkTarget(cp, target);
        const result = this.#lookupEntry(targetPath, true, 0);
        if (!result.entry) throw createENOENT(syscall, p);
        current = result.entry;
      }

      if (!current.isDirectory()) throw createENOTDIR(syscall, p);

      this.#ensurePopulated(current);

      const children = getChildren(current, syscall, p);
      let entry = children.get(segment);
      if (!entry) {
        if (createMissing) {
          entry = new MemoryEntry(TYPE_DIR);
          entry.children = new Map();
          children.set(segment, entry);
        } else {
          throw createENOENT(syscall, p);
        }
      }
      current = entry;
    }

    if (current.isSymbolicLink()) {
      const target = current.target ?? "";
      const targetPath = this.#resolveSymlinkTarget(parentPath, target);
      const result = this.#lookupEntry(targetPath, true, 0);
      if (!result.entry) throw createENOENT(syscall, p);
      current = result.entry;
    }

    if (!current.isDirectory()) throw createENOTDIR(syscall, p);
    this.#ensurePopulated(current);
    return current;
  }

  /**
   * Lazy-populate support for directories.
   *
   * This infrastructure allows directory entries to defer their content
   * population until the first access. The populate callback receives a
   * `ScopedVfs` that can add files, directories, and symlinks.
   *
   * This method is invoked from internal helpers such as `#lookupEntry`,
   * `#ensureParent`, and `readdirSync` to ensure directory contents are
   * populated before access. However, the *populate callback* path
   * (where `entry.populate` is set and invoked) is not currently
   * constructible via the public API, so the lazy-populate behaviour
   * remains infrastructure for future use and for nested lazy directories.
   */
  /* istanbul ignore next -- lazy-populate infrastructure for future use */
  #ensurePopulated(entry: MemoryEntry): void {
    if (entry.isDirectory() && !entry.populated && entry.populate) {
      const children = entry.children;
      if (!children) return;

      const scoped: ScopedVfs = {
        addFile: (name, content, opts) => {
          const fe = new MemoryEntry(TYPE_FILE, opts);
          fe.content =
            typeof content === "string" ? Buffer.from(content) : content;
          children.set(name, fe);
        },
        addDirectory: (name, populate, opts) => {
          const de = new MemoryEntry(TYPE_DIR, opts);
          de.children = new Map();
          if (typeof populate === "function") {
            de.populate = populate;
            de.populated = false;
          }
          children.set(name, de);
        },
        addSymlink: (name, target, opts) => {
          const se = new MemoryEntry(TYPE_SYMLINK, opts);
          se.target = target;
          children.set(name, se);
        },
      };
      entry.populate(scoped);
      entry.populated = true;
    }
  }

  #createStats(entry: MemoryEntry, overrideSize?: number): VfsStats {
    const options = {
      mode: entry.mode,
      nlink: entry.nlink,
      uid: entry.uid,
      gid: entry.gid,
      atimeMs: entry.atime,
      mtimeMs: entry.mtime,
      ctimeMs: entry.ctime,
      birthtimeMs: entry.birthtime,
    };
    if (entry.isFile()) {
      const size = overrideSize ?? entry.content?.length ?? 0;
      return createFileStats(size, options);
    }
    if (entry.isDirectory()) return createDirectoryStats(options);
    // symlink
    return createSymlinkStats(entry.target?.length ?? 0, options);
  }

  // ── Existence ────────────────────────────────────────────────────────────

  existsSync(p: string): boolean {
    try {
      const result = this.#lookupEntry(p, true);
      return result.entry !== null;
    } catch {
      return false;
    }
  }

  // ── Stat ─────────────────────────────────────────────────────────────────

  statSync(p: string): VfsStats {
    const entry = this.#getEntry(p, "stat", true);
    return this.#createStats(entry);
  }

  async stat(p: string): Promise<VfsStats> {
    return this.statSync(p);
  }

  lstatSync(p: string): VfsStats {
    const entry = this.#getEntry(p, "lstat", false);
    return this.#createStats(entry);
  }

  async lstat(p: string): Promise<VfsStats> {
    return this.lstatSync(p);
  }

  // ── Access ───────────────────────────────────────────────────────────────

  accessSync(p: string, mode?: number): void {
    const entry = this.#getEntry(p, "access", true);
    if (mode !== undefined && mode !== 0) {
      const effectiveMode = entry.mode & 0o777;
      if (mode & 4 && !(effectiveMode & 0o444)) throw createEACCES("access", p);
      if (mode & 2 && !(effectiveMode & 0o222)) throw createEACCES("access", p);
    }
  }

  // ── Read operations ──────────────────────────────────────────────────────

  readFileSync(
    p: string,
    options?: ReadFileOptions | BufferEncoding | null,
  ): Buffer | string {
    const entry = this.#getEntry(p, "open", true);
    if (entry.isDirectory()) throw createEISDIR("read", p);

    const buf = entry.content ?? Buffer.alloc(0);
    const enc =
      typeof options === "string"
        ? options
        : ((options as ReadFileOptions | null | undefined)?.encoding ?? null);

    if (enc) return buf.toString(enc as BufferEncoding);
    return buf;
  }

  async readFile(
    p: string,
    options?: ReadFileOptions | BufferEncoding | null,
  ): Promise<Buffer | string> {
    return this.readFileSync(p, options);
  }

  readdirSync(p: string, options?: ReaddirOptions): string[] | VfsDirent[] {
    const entry = this.#getEntry(p, "scandir", true);
    if (!entry.isDirectory()) throw createENOTDIR("scandir", p);

    const normalized = this.#normalizePath(p);
    this.#ensurePopulated(entry);

    const children = getChildren(entry, "scandir", p);
    const withFileTypes = options?.withFileTypes === true;
    const recursive = options?.recursive === true;

    if (recursive) {
      return this.#readdirRecursive(entry, normalized, withFileTypes);
    }

    if (withFileTypes) {
      const dirents: VfsDirent[] = [];
      for (const [name, childEntry] of children) {
        const type = childEntry.isSymbolicLink()
          ? TYPE_SYMLINK
          : childEntry.isDirectory()
            ? TYPE_DIR
            : TYPE_FILE;
        dirents.push(new VfsDirent(name, type, normalized));
      }
      return dirents;
    }

    return [...children.keys()];
  }

  async readdir(
    p: string,
    options?: ReaddirOptions,
  ): Promise<string[] | VfsDirent[]> {
    return this.readdirSync(p, options);
  }

  #readdirRecursive(
    dirEntry: MemoryEntry,
    dirPath: string,
    withFileTypes: boolean,
  ): string[] | VfsDirent[] {
    const results: (string | VfsDirent)[] = [];

    const walk = (
      entry: MemoryEntry,
      currentPath: string,
      relativePath: string,
    ) => {
      this.#ensurePopulated(entry);
      const children = entry.children;
      if (!children) return;
      for (const [name, childEntry] of children) {
        const childRelative = relativePath ? relativePath + "/" + name : name;
        if (withFileTypes) {
          const type = childEntry.isSymbolicLink()
            ? TYPE_SYMLINK
            : childEntry.isDirectory()
              ? TYPE_DIR
              : TYPE_FILE;
          results.push(new VfsDirent(childRelative, type, dirPath));
        } else {
          results.push(childRelative);
        }
        // Recurse into directories (follow symlinks to dirs)
        let resolved = childEntry;
        if (childEntry.isSymbolicLink()) {
          const target = childEntry.target ?? "";
          const targetPath = this.#resolveSymlinkTarget(
            pathPosix.join(currentPath, name),
            target,
          );
          const r = this.#lookupEntry(targetPath, true, 0);
          if (r.entry) resolved = r.entry;
        }
        if (resolved.isDirectory()) {
          walk(resolved, pathPosix.join(currentPath, name), childRelative);
        }
      }
    };

    walk(dirEntry, dirPath, "");
    return results as string[] | VfsDirent[];
  }

  realpathSync(p: string): string {
    const result = this.#lookupEntry(p, true);
    if (result.eloop) throw createELOOP("realpath", p);
    if (!result.entry || !result.resolvedPath)
      throw createENOENT("realpath", p);
    return result.resolvedPath;
  }

  readlinkSync(p: string): string {
    const entry = this.#getEntry(p, "readlink", false);
    if (!entry.isSymbolicLink()) throw createEINVAL("readlink", p);
    return getTarget(entry, "readlink", p);
  }

  // ── Write operations ─────────────────────────────────────────────────────

  #checkWritable(syscall: string, p: string): void {
    if (this.#readonly) throw createEROFS(syscall, p);
  }

  writeFileSync(
    p: string,
    data: string | Buffer | Uint8Array,
    options?: WriteFileOptions | BufferEncoding | null,
  ): void {
    this.#checkWritable("write", p);
    const normalized = this.#normalizePath(p);

    const enc =
      typeof options === "string"
        ? options
        : ((options as WriteFileOptions | null | undefined)?.encoding ??
          "utf8");

    let buf: Buffer;
    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (data instanceof Uint8Array) {
      buf = Buffer.from(data);
    } else {
      buf = Buffer.from(data as string, enc as BufferEncoding);
    }

    const existing = this.#lookupEntry(normalized, true);
    if (existing.entry) {
      if (existing.entry.isDirectory()) throw createEISDIR("open", p);
      existing.entry.content = buf;
      const now = Date.now();
      existing.entry.mtime = now;
      existing.entry.ctime = now;
    } else {
      const parent = this.#ensureParent(normalized, false, "open");
      const name = pathPosix.basename(normalized);
      const entry = new MemoryEntry(TYPE_FILE);
      entry.content = buf;
      getChildren(parent, "open", p).set(name, entry);
      const now = Date.now();
      parent.mtime = now;
      parent.ctime = now;
    }
  }

  async writeFile(
    p: string,
    data: string | Buffer | Uint8Array,
    options?: WriteFileOptions | BufferEncoding | null,
  ): Promise<void> {
    return this.writeFileSync(p, data, options);
  }

  appendFileSync(
    p: string,
    data: string | Buffer | Uint8Array,
    options?: WriteFileOptions | BufferEncoding | null,
  ): void {
    this.#checkWritable("write", p);
    const normalized = this.#normalizePath(p);

    const enc =
      typeof options === "string"
        ? options
        : ((options as WriteFileOptions | null | undefined)?.encoding ??
          "utf8");

    let buf: Buffer;
    if (Buffer.isBuffer(data)) {
      buf = data;
    } else if (data instanceof Uint8Array) {
      buf = Buffer.from(data);
    } else {
      buf = Buffer.from(data as string, enc as BufferEncoding);
    }

    const existing = this.#lookupEntry(normalized, true);
    if (existing.entry) {
      if (existing.entry.isDirectory()) throw createEISDIR("open", p);
      const prev = existing.entry.content ?? Buffer.alloc(0);
      existing.entry.content = Buffer.concat([prev, buf]);
      const now = Date.now();
      existing.entry.mtime = now;
      existing.entry.ctime = now;
    } else {
      const parent = this.#ensureParent(normalized, false, "open");
      const name = pathPosix.basename(normalized);
      const entry = new MemoryEntry(TYPE_FILE);
      entry.content = buf;
      getChildren(parent, "open", p).set(name, entry);
    }
  }

  async appendFile(
    p: string,
    data: string | Buffer | Uint8Array,
    options?: WriteFileOptions | BufferEncoding | null,
  ): Promise<void> {
    return this.appendFileSync(p, data, options);
  }

  mkdirSync(
    p: string,
    options?: { recursive?: boolean; mode?: number },
  ): string | undefined {
    this.#checkWritable("mkdir", p);
    const normalized = this.#normalizePath(p);
    const recursive = options?.recursive === true;

    const existing = this.#lookupEntry(normalized, true);
    if (existing.entry) {
      if (existing.entry.isDirectory() && recursive) return undefined;
      throw createEEXIST("mkdir", p);
    }

    if (recursive) {
      const segments = this.#splitPath(normalized);
      let current = this.#root;
      let firstCreated: string | undefined;
      let currentPath = "/";

      for (let i = 0; i < segments.length; i++) {
        const segment = segments[i];
        if (segment === undefined) break;
        this.#ensurePopulated(current);
        const children = getChildren(current, "mkdir", p);
        let child = children.get(segment);
        if (!child) {
          child = new MemoryEntry(TYPE_DIR);
          child.children = new Map();
          children.set(segment, child);
          if (firstCreated === undefined) {
            firstCreated = "/" + segments.slice(0, i + 1).join("/");
          }
        } else if (!child.isDirectory()) {
          throw createENOTDIR("mkdir", p);
        }
        currentPath = pathPosix.join(currentPath, segment);
        current = child;
      }
      return firstCreated;
    }

    const parent = this.#ensureParent(normalized, false, "mkdir");
    const name = pathPosix.basename(normalized);
    const entry = new MemoryEntry(TYPE_DIR, { mode: options?.mode });
    entry.children = new Map();
    getChildren(parent, "mkdir", p).set(name, entry);
    return undefined;
  }

  async mkdir(
    p: string,
    options?: { recursive?: boolean; mode?: number },
  ): Promise<string | undefined> {
    return this.mkdirSync(p, options);
  }

  rmdirSync(p: string): void {
    this.#checkWritable("rmdir", p);
    const normalized = this.#normalizePath(p);
    const entry = this.#getEntry(normalized, "rmdir", true);
    if (!entry.isDirectory()) throw createENOTDIR("rmdir", p);

    this.#ensurePopulated(entry);
    const children = getChildren(entry, "rmdir", p);
    if (children.size > 0) throw createENOTEMPTY("rmdir", p);

    const parent = this.#ensureParent(normalized, false, "rmdir");
    const name = pathPosix.basename(normalized);
    getChildren(parent, "rmdir", p).delete(name);
  }

  async rmdir(p: string): Promise<void> {
    return this.rmdirSync(p);
  }

  unlinkSync(p: string): void {
    this.#checkWritable("unlink", p);
    const normalized = this.#normalizePath(p);
    const result = this.#lookupEntry(normalized, false);
    if (!result.entry) throw createENOENT("unlink", p);
    if (result.entry.isDirectory()) throw createEISDIR("unlink", p);

    const parent = this.#ensureParent(normalized, false, "unlink");
    const name = pathPosix.basename(normalized);
    getChildren(parent, "unlink", p).delete(name);
  }

  async unlink(p: string): Promise<void> {
    return this.unlinkSync(p);
  }

  renameSync(oldPath: string, newPath: string): void {
    this.#checkWritable("rename", oldPath);
    const oldNorm = this.#normalizePath(oldPath);
    const newNorm = this.#normalizePath(newPath);

    const result = this.#lookupEntry(oldNorm, false);
    if (!result.entry) throw createENOENT("rename", oldPath);

    const entry = result.entry;
    const oldParent = this.#ensureParent(oldNorm, false, "rename");
    const oldName = pathPosix.basename(oldNorm);

    const newParent = this.#ensureParent(newNorm, false, "rename");
    const newName = pathPosix.basename(newNorm);

    getChildren(oldParent, "rename", oldPath).delete(oldName);
    getChildren(newParent, "rename", newPath).set(newName, entry);
  }

  async rename(oldPath: string, newPath: string): Promise<void> {
    return this.renameSync(oldPath, newPath);
  }

  copyFileSync(src: string, dest: string): void {
    this.#checkWritable("copyfile", dest);
    const srcNorm = this.#normalizePath(src);
    const destNorm = this.#normalizePath(dest);

    const srcEntry = this.#getEntry(srcNorm, "copyfile", true);
    if (!srcEntry.isFile()) throw createEINVAL("copyfile", src);

    const existing = this.#lookupEntry(destNorm, true);
    if (existing.entry) {
      if (existing.entry.isDirectory()) throw createEISDIR("copyfile", dest);
      existing.entry.content = srcEntry.content
        ? Buffer.from(srcEntry.content)
        : Buffer.alloc(0);
    } else {
      const parent = this.#ensureParent(destNorm, false, "copyfile");
      const name = pathPosix.basename(destNorm);
      const entry = new MemoryEntry(TYPE_FILE);
      entry.content = srcEntry.content
        ? Buffer.from(srcEntry.content)
        : Buffer.alloc(0);
      getChildren(parent, "copyfile", dest).set(name, entry);
    }
  }

  async copyFile(src: string, dest: string): Promise<void> {
    return this.copyFileSync(src, dest);
  }

  symlinkSync(target: string, p: string): void {
    this.#checkWritable("symlink", p);
    const normalized = this.#normalizePath(p);

    const existing = this.#lookupEntry(normalized, false);
    if (existing.entry) throw createEEXIST("symlink", p);

    const parent = this.#ensureParent(normalized, false, "symlink");
    const name = pathPosix.basename(normalized);
    const entry = new MemoryEntry(TYPE_SYMLINK);
    entry.target = target;
    getChildren(parent, "symlink", p).set(name, entry);
  }

  async symlink(target: string, p: string): Promise<void> {
    return this.symlinkSync(target, p);
  }

  chmodSync(p: string, mode: string | number): void {
    const normalized = this.#normalizePath(p);
    const entry = this.#getEntry(normalized, "chmod", true);
    entry.mode =
      (entry.mode & 0o170000) |
      (typeof mode === "string" ? parseInt(mode, 8) : mode & 0o777);
  }

  async chmod(p: string, mode: string | number): Promise<void> {
    return this.chmodSync(p, mode);
  }

  chownSync(p: string, uid: number, gid: number): void {
    const normalized = this.#normalizePath(p);
    const entry = this.#getEntry(normalized, "chown", true);
    entry.uid = uid;
    entry.gid = gid;
  }

  async chown(p: string, uid: number, gid: number): Promise<void> {
    return this.chownSync(p, uid, gid);
  }

  utimesSync(p: string, atime: number | Date, mtime: number | Date): void {
    const normalized = this.#normalizePath(p);
    const entry = this.#getEntry(normalized, "utimes", true);
    entry.atime = typeof atime === "number" ? atime * 1000 : +atime;
    entry.mtime = typeof mtime === "number" ? mtime * 1000 : +mtime;
    entry.ctime = Date.now();
  }

  mkdtempSync(prefix: string): string {
    this.#checkWritable("mkdtemp", prefix);
    const normalized = this.#normalizePath(prefix);
    const chars =
      "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
    let suffix = "";
    for (let i = 0; i < 6; i++) {
      suffix += chars[Math.floor(Math.random() * chars.length)];
    }
    const dirPath = normalized + suffix;
    this.mkdirSync(dirPath, { recursive: true });
    return dirPath;
  }

  async mkdtemp(prefix: string): Promise<string> {
    return this.mkdtempSync(prefix);
  }

  rmSync(p: string, options?: { recursive?: boolean; force?: boolean }): void {
    this.#checkWritable("rm", p);
    const force = options?.force === true;
    const recursive = options?.recursive === true;

    let stats: VfsStats;
    try {
      stats = this.lstatSync(p);
    } catch (err) {
      if (force && (err as NodeJS.ErrnoException).code === "ENOENT") return;
      throw err;
    }

    if (stats.isSymbolicLink()) {
      this.unlinkSync(p);
      return;
    }

    if (stats.isDirectory()) {
      if (!recursive) throw createEISDIR("rm", p);
      const entries = this.readdirSync(p) as string[];
      for (const name of entries) {
        this.rmSync(pathPosix.join(p, name), options);
      }
      this.rmdirSync(p);
    } else {
      this.unlinkSync(p);
    }
  }

  async rm(
    p: string,
    options?: { recursive?: boolean; force?: boolean },
  ): Promise<void> {
    return this.rmSync(p, options);
  }

  truncateSync(p: string, len = 0): void {
    this.#checkWritable("truncate", p);
    const entry = this.#getEntry(p, "truncate", true);
    if (entry.isDirectory()) throw createEISDIR("truncate", p);
    const current = entry.content ?? Buffer.alloc(0);
    if (len <= current.length) {
      entry.content = current.subarray(0, len);
    } else {
      entry.content = Buffer.concat([
        current,
        Buffer.alloc(len - current.length),
      ]);
    }
    const now = Date.now();
    entry.mtime = now;
    entry.ctime = now;
  }

  async truncate(p: string, len?: number): Promise<void> {
    return this.truncateSync(p, len);
  }

  linkSync(existingPath: string, newPath: string): void {
    this.#checkWritable("link", newPath);
    const existNorm = this.#normalizePath(existingPath);
    const newNorm = this.#normalizePath(newPath);

    const entry = this.#getEntry(existNorm, "link", true);
    if (entry.isDirectory()) throw createEISDIR("link", existingPath);

    const existing = this.#lookupEntry(newNorm, false);
    if (existing.entry) throw createEEXIST("link", newPath);

    const parent = this.#ensureParent(newNorm, false, "link");
    getChildren(parent, "link", newPath).set(
      pathPosix.basename(newNorm),
      entry,
    );
    entry.nlink++;
  }

  async link(existingPath: string, newPath: string): Promise<void> {
    return this.linkSync(existingPath, newPath);
  }
}
