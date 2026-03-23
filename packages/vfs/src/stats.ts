/**
 * Stats-like objects for the virtual file system.
 *
 * Node.js does not expose a public constructor for `fs.Stats` with custom
 * values, so we define our own {@link VfsStats} class that implements the
 * same interface.  Code that checks `stats.isFile()`, `stats.isDirectory()`,
 * or reads `stats.size` / `stats.mtime` will work identically.
 */

// Distinctive device number used for all VFS entries (0xVF5 = 4085)
const VFS_DEV = 4085;
// Default block size (4 KiB)
const DEFAULT_BLOCK_SIZE = 4096;

let inoCounter = 1;

function nextIno(): number {
  return inoCounter++;
}

export interface StatOptions {
  mode?: number;
  uid?: number;
  gid?: number;
  nlink?: number;
  atimeMs?: number;
  mtimeMs?: number;
  ctimeMs?: number;
  birthtimeMs?: number;
}

/** Minimal Stats-like object returned by VFS operations. */
export class VfsStats {
  readonly dev: number = VFS_DEV;
  readonly ino: number;
  readonly mode: number;
  readonly nlink: number;
  readonly uid: number;
  readonly gid: number;
  readonly rdev: number = 0;
  readonly size: number;
  readonly blksize: number = DEFAULT_BLOCK_SIZE;
  readonly blocks: number;
  readonly atimeMs: number;
  readonly mtimeMs: number;
  readonly ctimeMs: number;
  readonly birthtimeMs: number;
  readonly atime: Date;
  readonly mtime: Date;
  readonly ctime: Date;
  readonly birthtime: Date;

  readonly #isFileFlag: boolean;
  readonly #isDirFlag: boolean;
  readonly #isSymlinkFlag: boolean;

  constructor(
    isFile: boolean,
    isDirectory: boolean,
    isSymlink: boolean,
    size: number,
    options: StatOptions = {},
  ) {
    const now = Date.now();
    this.#isFileFlag = isFile;
    this.#isDirFlag = isDirectory;
    this.#isSymlinkFlag = isSymlink;
    this.ino = nextIno();
    this.size = size;
    this.blocks = Math.ceil(size / 512);

    // File type bits
    const S_IFREG = 0o100000;
    const S_IFDIR = 0o040000;
    const S_IFLNK = 0o120000;

    const defaultMode = isDirectory ? 0o755 : 0o644;
    const rawMode = options.mode ?? defaultMode;
    const typeBit = isDirectory ? S_IFDIR : isSymlink ? S_IFLNK : S_IFREG;
    this.mode = (rawMode & ~0o170000) | typeBit;

    this.nlink = options.nlink ?? 1;
    this.uid = options.uid ?? process.getuid?.() ?? 0;
    this.gid = options.gid ?? process.getgid?.() ?? 0;

    this.atimeMs = options.atimeMs ?? now;
    this.mtimeMs = options.mtimeMs ?? now;
    this.ctimeMs = options.ctimeMs ?? now;
    this.birthtimeMs = options.birthtimeMs ?? now;

    this.atime = new Date(this.atimeMs);
    this.mtime = new Date(this.mtimeMs);
    this.ctime = new Date(this.ctimeMs);
    this.birthtime = new Date(this.birthtimeMs);
  }

  isFile(): boolean {
    return this.#isFileFlag;
  }

  isDirectory(): boolean {
    return this.#isDirFlag;
  }

  isSymbolicLink(): boolean {
    return this.#isSymlinkFlag;
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

export function createFileStats(size: number, options?: StatOptions): VfsStats {
  return new VfsStats(true, false, false, size, options);
}

export function createDirectoryStats(options?: StatOptions): VfsStats {
  return new VfsStats(false, true, false, DEFAULT_BLOCK_SIZE, options);
}

export function createSymlinkStats(
  size: number,
  options?: StatOptions,
): VfsStats {
  return new VfsStats(false, false, true, size, options);
}
