/**
 * Tests for `@scratchyjs/vfs`.
 *
 * Covers three layers:
 * 1. `MemoryProvider` – low-level in-memory FS operations.
 * 2. `VirtualFileSystem` – path routing and `addFile`/`addDirectory` helpers.
 * 3. `mount()` / `unmount()` – monkey-patching of `node:fs`.
 */
import {
  createEACCES,
  createEBADF,
  createEINVAL,
  createELOOP,
  createEROFS,
} from "./errors.js";
import { create } from "./index.js";
import type { VfsDirent } from "./index.js";
import { MemoryProvider } from "./memory-provider.js";
import { getRelativePath, isUnderMountPoint } from "./router.js";
import { createSymlinkStats } from "./stats.js";
import fs from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ─── MemoryProvider ───────────────────────────────────────────────────────────

describe("MemoryProvider", () => {
  let provider: MemoryProvider;

  beforeEach(() => {
    provider = new MemoryProvider();
  });

  it("returns false for existsSync on a fresh provider", () => {
    expect(provider.existsSync("/missing")).toBe(false);
  });

  it("writes and reads a file as Buffer", () => {
    provider.writeFileSync("/hello.txt", Buffer.from("hello"));
    const result = provider.readFileSync("/hello.txt");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect((result as Buffer).toString()).toBe("hello");
  });

  it("writes and reads a file as string with encoding", () => {
    provider.writeFileSync("/greet.txt", "world");
    const result = provider.readFileSync("/greet.txt", { encoding: "utf8" });
    expect(result).toBe("world");
  });

  it("existsSync returns true after writing a file", () => {
    provider.writeFileSync("/exists.txt", "data");
    expect(provider.existsSync("/exists.txt")).toBe(true);
  });

  it("statSync returns an isFile() stat for a file", () => {
    provider.writeFileSync("/stat.txt", "abc");
    const stats = provider.statSync("/stat.txt");
    expect(stats.isFile()).toBe(true);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.size).toBe(3);
  });

  it("statSync returns an isDirectory() stat for a directory", () => {
    provider.mkdirSync("/mydir");
    const stats = provider.statSync("/mydir");
    expect(stats.isDirectory()).toBe(true);
    expect(stats.isFile()).toBe(false);
  });

  it("throws ENOENT when reading a missing file", () => {
    expect(() => provider.readFileSync("/nope.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("throws EISDIR when reading a directory as a file", () => {
    provider.mkdirSync("/adir");
    expect(() => provider.readFileSync("/adir")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("mkdirSync creates a directory", () => {
    provider.mkdirSync("/newdir");
    expect(provider.existsSync("/newdir")).toBe(true);
  });

  it("mkdirSync with recursive creates nested directories", () => {
    provider.mkdirSync("/a/b/c", { recursive: true });
    expect(provider.existsSync("/a/b/c")).toBe(true);
  });

  it("mkdirSync throws EEXIST when directory already exists", () => {
    provider.mkdirSync("/dup");
    expect(() => provider.mkdirSync("/dup")).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
  });

  it("mkdirSync with recursive does NOT throw when directory exists", () => {
    provider.mkdirSync("/safe");
    expect(() =>
      provider.mkdirSync("/safe", { recursive: true }),
    ).not.toThrow();
  });

  it("readdirSync lists files in a directory", () => {
    provider.mkdirSync("/listing");
    provider.writeFileSync("/listing/a.ts", "");
    provider.writeFileSync("/listing/b.ts", "");
    const entries = provider.readdirSync("/listing") as string[];
    expect(entries.sort()).toEqual(["a.ts", "b.ts"]);
  });

  it("readdirSync with withFileTypes returns Dirent-like objects", () => {
    provider.mkdirSync("/typed");
    provider.writeFileSync("/typed/file.txt", "");
    provider.mkdirSync("/typed/subdir");
    const entries = provider.readdirSync("/typed", {
      withFileTypes: true,
    }) as import("./memory-provider.js").VfsDirent[];
    const file = entries.find((e) => e.name === "file.txt");
    const dir = entries.find((e) => e.name === "subdir");
    expect(file?.isFile()).toBe(true);
    expect(dir?.isDirectory()).toBe(true);
  });

  it("unlinkSync removes a file", () => {
    provider.writeFileSync("/del.txt", "bye");
    provider.unlinkSync("/del.txt");
    expect(provider.existsSync("/del.txt")).toBe(false);
  });

  it("unlinkSync throws ENOENT on missing file", () => {
    expect(() => provider.unlinkSync("/ghost.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("rmdirSync removes an empty directory", () => {
    provider.mkdirSync("/empty");
    provider.rmdirSync("/empty");
    expect(provider.existsSync("/empty")).toBe(false);
  });

  it("rmdirSync throws ENOTEMPTY on non-empty directory", () => {
    provider.mkdirSync("/notempty");
    provider.writeFileSync("/notempty/x.txt", "");
    expect(() => provider.rmdirSync("/notempty")).toThrow(
      expect.objectContaining({ code: "ENOTEMPTY" }),
    );
  });

  it("rmSync with recursive removes a tree", () => {
    provider.mkdirSync("/tree/a/b", { recursive: true });
    provider.writeFileSync("/tree/a/b/deep.txt", "deep");
    provider.rmSync("/tree", { recursive: true });
    expect(provider.existsSync("/tree")).toBe(false);
  });

  it("rmSync with force does not throw on missing path", () => {
    expect(() =>
      provider.rmSync("/nowhere", { recursive: true, force: true }),
    ).not.toThrow();
  });

  it("renameSync moves a file", () => {
    provider.writeFileSync("/old.txt", "content");
    provider.renameSync("/old.txt", "/new.txt");
    expect(provider.existsSync("/old.txt")).toBe(false);
    expect(provider.readFileSync("/new.txt", { encoding: "utf8" })).toBe(
      "content",
    );
  });

  it("appendFileSync appends to an existing file", () => {
    provider.writeFileSync("/append.txt", "hello");
    provider.appendFileSync("/append.txt", " world");
    expect(provider.readFileSync("/append.txt", { encoding: "utf8" })).toBe(
      "hello world",
    );
  });

  it("appendFileSync creates the file if it does not exist", () => {
    provider.appendFileSync("/new-append.txt", "first");
    expect(provider.readFileSync("/new-append.txt", { encoding: "utf8" })).toBe(
      "first",
    );
  });

  it("copyFileSync duplicates a file", () => {
    provider.writeFileSync("/src.txt", "original");
    provider.copyFileSync("/src.txt", "/dest.txt");
    expect(provider.readFileSync("/dest.txt", { encoding: "utf8" })).toBe(
      "original",
    );
  });

  it("symlinkSync + readlinkSync round-trip", () => {
    provider.writeFileSync("/target.txt", "data");
    provider.symlinkSync("/target.txt", "/link.txt");
    expect(provider.readlinkSync("/link.txt")).toBe("/target.txt");
  });

  it("statSync follows symlinks; lstatSync does not", () => {
    provider.writeFileSync("/real.txt", "real");
    provider.symlinkSync("/real.txt", "/sym.txt");
    expect(provider.statSync("/sym.txt").isFile()).toBe(true);
    expect(provider.lstatSync("/sym.txt").isSymbolicLink()).toBe(true);
  });

  it("truncateSync shrinks a file", () => {
    provider.writeFileSync("/big.txt", "abcdef");
    provider.truncateSync("/big.txt", 3);
    expect(provider.readFileSync("/big.txt", { encoding: "utf8" })).toBe("abc");
  });

  it("mkdtempSync creates a unique directory", () => {
    provider.mkdirSync("/tmp");
    const dir1 = provider.mkdtempSync("/tmp/prefix-");
    const dir2 = provider.mkdtempSync("/tmp/prefix-");
    expect(provider.statSync(dir1).isDirectory()).toBe(true);
    expect(dir1).not.toBe(dir2);
  });

  it("linkSync creates a hard link", () => {
    provider.writeFileSync("/original.txt", "shared");
    provider.linkSync("/original.txt", "/hardlink.txt");
    expect(provider.readFileSync("/hardlink.txt", { encoding: "utf8" })).toBe(
      "shared",
    );
  });

  it("realpathSync resolves symlinks", () => {
    provider.mkdirSync("/real-dir");
    provider.writeFileSync("/real-dir/file.txt", "hi");
    provider.symlinkSync("/real-dir", "/link-dir");
    const resolved = provider.realpathSync("/link-dir/file.txt");
    expect(resolved).toBe("/real-dir/file.txt");
  });

  it("accessSync does not throw for a readable file", () => {
    provider.writeFileSync("/access.txt", "");
    expect(() => provider.accessSync("/access.txt")).not.toThrow();
  });

  it("accessSync throws ENOENT for a missing file", () => {
    expect(() => provider.accessSync("/absent.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });
});

// ─── VirtualFileSystem (no mount) ────────────────────────────────────────────

describe("VirtualFileSystem (unmounted)", () => {
  it("create() returns a VirtualFileSystem with mounted=false", () => {
    const vfs = create();
    expect(vfs.mounted).toBe(false);
    expect(vfs.mountPoint).toBeNull();
  });

  it("addFile + readFileSync work before mounting", () => {
    const vfs = create();
    vfs.addFile("/config.json", '{"ok":true}');
    const result = vfs.readFileSync("/config.json", { encoding: "utf8" });
    expect(result).toBe('{"ok":true}');
  });

  it("addDirectory creates a directory pre-mount", () => {
    const vfs = create();
    vfs.addDirectory("/src");
    expect(vfs.statSync("/src").isDirectory()).toBe(true);
  });

  it("addDirectory with populate callback creates nested files", () => {
    const vfs = create();
    vfs.addDirectory("/assets", (dir) => {
      dir.addFile("logo.svg", "<svg/>");
      dir.addDirectory("icons");
    });
    expect(vfs.existsSync("/assets/logo.svg")).toBe(true);
    expect(vfs.statSync("/assets/icons").isDirectory()).toBe(true);
  });

  it("throws ERR_INVALID_STATE when calling cwd() without virtualCwd option", () => {
    const vfs = create();
    expect(() => vfs.cwd()).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_STATE" }),
    );
  });
});

// ─── mount / unmount ─────────────────────────────────────────────────────────

describe("mount / unmount", () => {
  let vfs: ReturnType<typeof create>;

  afterEach(() => {
    // Ensure we always clean up even if a test throws
    if (vfs?.mounted) vfs.unmount();
  });

  it("mount() sets mounted=true and mountPoint", () => {
    vfs = create();
    vfs.mount("/vfs-test");
    expect(vfs.mounted).toBe(true);
    expect(vfs.mountPoint).toContain("vfs-test");
  });

  it("throws when mount() is called twice", () => {
    vfs = create();
    vfs.mount("/vfs-double");
    expect(() => vfs.mount("/vfs-double-2")).toThrow("already mounted");
  });

  it("unmount() sets mounted=false and restores fs", () => {
    const originalFn = fs.existsSync;
    vfs = create();
    vfs.mount("/vfs-restore");
    // While mounted, existsSync should be the VFS wrapper
    expect(fs.existsSync).not.toBe(originalFn);
    vfs.unmount();
    expect(vfs.mounted).toBe(false);
    // After unmount, the original function should be restored
    expect(fs.existsSync).toBe(originalFn);
  });

  it("unmount() is idempotent", () => {
    vfs = create();
    vfs.mount("/vfs-idempotent");
    vfs.unmount();
    expect(() => vfs.unmount()).not.toThrow();
  });
});

// ─── fs interception via mount ────────────────────────────────────────────────

describe("fs interception via mount", () => {
  const MOUNT = "/scratchyjs-vfs-test-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    vfs.unmount();
  });

  it("fs.existsSync returns true for a mounted virtual file", () => {
    vfs.addFile(MOUNT + "/a.txt", "hi");
    expect(fs.existsSync(MOUNT + "/a.txt")).toBe(true);
  });

  it("fs.existsSync returns false for a missing path under mount", () => {
    expect(fs.existsSync(MOUNT + "/missing.txt")).toBe(false);
  });

  it("fs.existsSync falls through to real fs for paths outside mount", () => {
    // process.cwd() is a real directory that exists
    expect(fs.existsSync(process.cwd())).toBe(true);
  });

  it("fs.readFileSync reads a virtual file as Buffer", () => {
    vfs.addFile(MOUNT + "/buf.txt", Buffer.from("buffer-data"));
    const result = fs.readFileSync(MOUNT + "/buf.txt");
    expect(Buffer.isBuffer(result)).toBe(true);
    expect(result.toString()).toBe("buffer-data");
  });

  it("fs.readFileSync reads a virtual file as string", () => {
    vfs.addFile(MOUNT + "/str.txt", "string-data");
    const result = fs.readFileSync(MOUNT + "/str.txt", "utf8");
    expect(result).toBe("string-data");
  });

  it("fs.readFileSync throws ENOENT for a missing virtual path", () => {
    expect(() => fs.readFileSync(MOUNT + "/no-such.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("fs.writeFileSync + fs.readFileSync round-trip", () => {
    fs.writeFileSync(MOUNT + "/write.txt", "written");
    expect(fs.readFileSync(MOUNT + "/write.txt", "utf8")).toBe("written");
  });

  it("fs.statSync.isFile() returns true for a virtual file", () => {
    vfs.addFile(MOUNT + "/s.txt", "stat");
    expect(fs.statSync(MOUNT + "/s.txt").isFile()).toBe(true);
  });

  it("fs.statSync.isDirectory() returns true for a virtual directory", () => {
    vfs.addDirectory(MOUNT + "/dir");
    expect(fs.statSync(MOUNT + "/dir").isDirectory()).toBe(true);
  });

  it("fs.mkdirSync + fs.readdirSync list the new directory", () => {
    fs.mkdirSync(MOUNT + "/newdir");
    fs.writeFileSync(MOUNT + "/newdir/f.ts", "");
    const entries = fs.readdirSync(MOUNT + "/newdir") as string[];
    expect(entries).toContain("f.ts");
  });

  it("fs.unlinkSync removes a virtual file", () => {
    vfs.addFile(MOUNT + "/rm.txt", "bye");
    fs.unlinkSync(MOUNT + "/rm.txt");
    expect(fs.existsSync(MOUNT + "/rm.txt")).toBe(false);
  });

  it("fs.rmSync recursive removes a virtual tree", () => {
    vfs.addDirectory(MOUNT + "/tree/sub");
    vfs.addFile(MOUNT + "/tree/sub/x.txt", "x");
    fs.rmSync(MOUNT + "/tree", { recursive: true });
    expect(fs.existsSync(MOUNT + "/tree")).toBe(false);
  });

  it("fs.renameSync moves a virtual file", () => {
    vfs.addFile(MOUNT + "/from.txt", "move me");
    fs.renameSync(MOUNT + "/from.txt", MOUNT + "/to.txt");
    expect(fs.existsSync(MOUNT + "/from.txt")).toBe(false);
    expect(fs.readFileSync(MOUNT + "/to.txt", "utf8")).toBe("move me");
  });

  it("fs.appendFileSync appends to a virtual file", () => {
    vfs.addFile(MOUNT + "/app.txt", "line1");
    fs.appendFileSync(MOUNT + "/app.txt", "\nline2");
    expect(fs.readFileSync(MOUNT + "/app.txt", "utf8")).toBe("line1\nline2");
  });

  it("fs.copyFileSync duplicates a virtual file", () => {
    vfs.addFile(MOUNT + "/copy-src.txt", "copy");
    fs.copyFileSync(MOUNT + "/copy-src.txt", MOUNT + "/copy-dest.txt");
    expect(fs.readFileSync(MOUNT + "/copy-dest.txt", "utf8")).toBe("copy");
  });

  it("fs.symlinkSync + fs.readlinkSync round-trip", () => {
    vfs.addFile(MOUNT + "/link-target.txt", "target");
    fs.symlinkSync(MOUNT + "/link-target.txt", MOUNT + "/link.txt");
    expect(fs.readlinkSync(MOUNT + "/link.txt")).toBe(
      MOUNT + "/link-target.txt",
    );
  });
});

// ─── fs.promises interception via mount ──────────────────────────────────────

describe("fs.promises interception via mount", () => {
  const MOUNT = "/scratchyjs-vfs-promises-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    vfs.unmount();
  });

  it("fs.promises.readFile reads a virtual file", async () => {
    vfs.addFile(MOUNT + "/async.txt", "async-data");
    const result = await fs.promises.readFile(MOUNT + "/async.txt", "utf8");
    expect(result).toBe("async-data");
  });

  it("fs.promises.writeFile + readFile round-trip", async () => {
    await fs.promises.writeFile(MOUNT + "/async-w.txt", "async-written");
    const result = await fs.promises.readFile(MOUNT + "/async-w.txt", "utf8");
    expect(result).toBe("async-written");
  });

  it("fs.promises.stat returns isFile() for a virtual file", async () => {
    vfs.addFile(MOUNT + "/async-stat.txt", "");
    const stats = await fs.promises.stat(MOUNT + "/async-stat.txt");
    expect(stats.isFile()).toBe(true);
  });

  it("fs.promises.mkdir + readdir round-trip", async () => {
    await fs.promises.mkdir(MOUNT + "/async-dir");
    await fs.promises.writeFile(MOUNT + "/async-dir/f.txt", "");
    const entries = await fs.promises.readdir(MOUNT + "/async-dir");
    expect(entries).toContain("f.txt");
  });

  it("fs.promises.unlink removes a virtual file", async () => {
    vfs.addFile(MOUNT + "/async-del.txt", "bye");
    await fs.promises.unlink(MOUNT + "/async-del.txt");
    expect(fs.existsSync(MOUNT + "/async-del.txt")).toBe(false);
  });

  it("fs.promises.rm recursive removes a virtual tree", async () => {
    vfs.addDirectory(MOUNT + "/async-tree");
    vfs.addFile(MOUNT + "/async-tree/leaf.txt", "leaf");
    await fs.promises.rm(MOUNT + "/async-tree", { recursive: true });
    expect(fs.existsSync(MOUNT + "/async-tree")).toBe(false);
  });
});

// ─── Symbol.dispose (explicit resource management) ────────────────────────────

describe("Symbol.dispose", () => {
  it("unmounts automatically via 'using' / Symbol.dispose", () => {
    const vfs = create();
    vfs.mount("/vfs-dispose-test");
    expect(vfs.mounted).toBe(true);
    vfs[Symbol.dispose]();
    expect(vfs.mounted).toBe(false);
  });

  it("Symbol.dispose is idempotent when already unmounted", () => {
    const vfs = create();
    vfs.mount("/vfs-dispose-idem");
    vfs.unmount();
    expect(() => vfs[Symbol.dispose]()).not.toThrow();
  });
});

// ─── virtualCwd feature ──────────────────────────────────────────────────────

describe("virtualCwd feature", () => {
  let vfs: ReturnType<typeof create>;
  const MOUNT = "/scratchyjs-vfs-vcwd-" + process.pid;

  beforeEach(() => {
    vfs = create({ virtualCwd: true });
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("cwd() returns null before chdir is called", () => {
    expect(vfs.cwd()).toBeNull();
  });

  it("cwd() returns the mount point after chdir to root", () => {
    vfs.chdir(MOUNT);
    expect(vfs.cwd()).toBe(MOUNT);
  });

  it("chdir() changes the virtual working directory", () => {
    vfs.addDirectory(MOUNT + "/subdir");
    vfs.chdir(MOUNT + "/subdir");
    expect(vfs.cwd()).toBe(MOUNT + "/subdir");
  });

  it("chdir() throws ENOENT for a missing directory", () => {
    expect(() => vfs.chdir(MOUNT + "/nonexistent")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("chdir() throws ENOTDIR when directory is actually a file", () => {
    vfs.addFile(MOUNT + "/file.txt", "data");
    expect(() => vfs.chdir(MOUNT + "/file.txt")).toThrow(
      expect.objectContaining({ code: "ENOTDIR" }),
    );
  });

  it("resolvePath() resolves paths relative to virtualCwd", () => {
    vfs.addDirectory(MOUNT + "/dir");
    vfs.chdir(MOUNT + "/dir");
    const resolved = vfs.resolvePath("file.txt");
    expect(resolved).toBe(MOUNT + "/dir/file.txt");
  });

  it("resolvePath() handles absolute paths independently of cwd", () => {
    vfs.addDirectory(MOUNT + "/dir");
    vfs.chdir(MOUNT + "/dir");
    const resolved = vfs.resolvePath(MOUNT + "/other.txt");
    expect(resolved).toBe(MOUNT + "/other.txt");
  });

  it("resolvePath() handles parent directory references", () => {
    vfs.addDirectory(MOUNT + "/a/b");
    vfs.chdir(MOUNT + "/a/b");
    const resolved = vfs.resolvePath("../file.txt");
    expect(resolved).toBe(MOUNT + "/a/file.txt");
  });

  it("fs.readFileSync with relative path uses virtualCwd", () => {
    vfs.addDirectory(MOUNT + "/rel");
    vfs.addFile(MOUNT + "/rel/file.txt", "relative");
    vfs.chdir(MOUNT + "/rel");
    const result = fs.readFileSync("file.txt", "utf8");
    expect(result).toBe("relative");
  });

  it("fs.writeFileSync with relative path uses virtualCwd", () => {
    vfs.addDirectory(MOUNT + "/write");
    vfs.chdir(MOUNT + "/write");
    fs.writeFileSync("newfile.txt", "written");
    expect(fs.readFileSync(MOUNT + "/write/newfile.txt", "utf8")).toBe(
      "written",
    );
  });

  it("fs.existsSync with relative path uses virtualCwd", () => {
    vfs.addDirectory(MOUNT + "/check");
    vfs.addFile(MOUNT + "/check/exists.txt", "");
    vfs.chdir(MOUNT + "/check");
    expect(fs.existsSync("exists.txt")).toBe(true);
  });

  it("fs.statSync with relative path uses virtualCwd", () => {
    vfs.addDirectory(MOUNT + "/stat");
    vfs.addFile(MOUNT + "/stat/file.txt", "");
    vfs.chdir(MOUNT + "/stat");
    const stats = fs.statSync("file.txt");
    expect(stats.isFile()).toBe(true);
  });

  it("process.cwd() is patched to return virtual cwd", () => {
    vfs.addDirectory(MOUNT + "/pdir");
    vfs.chdir(MOUNT + "/pdir");
    expect(process.cwd()).toBe(MOUNT + "/pdir");
  });
});

// ─── overlay mode ────────────────────────────────────────────────────────────

describe("overlay mode", () => {
  let vfs: ReturnType<typeof create>;
  const MOUNT = "/scratchyjs-vfs-overlay-" + process.pid;

  beforeEach(() => {
    vfs = create({ overlay: true });
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("overlay=true only intercepts paths that exist in VFS", () => {
    vfs.addFile(MOUNT + "/virtual.txt", "virtual");
    expect(fs.existsSync(MOUNT + "/virtual.txt")).toBe(true);
    // Non-existent paths fall through to real fs (will be false)
    expect(fs.existsSync(MOUNT + "/not-there.txt")).toBe(false);
  });

  it("overlay mode allows mixing virtual and real files at different prefixes", () => {
    vfs.addFile(MOUNT + "/vfile.txt", "virtual-data");
    const vContent = fs.readFileSync(MOUNT + "/vfile.txt", "utf8");
    expect(vContent).toBe("virtual-data");
  });

  it("overlay=true falls through to real fs for non-existent VFS paths", () => {
    // In overlay mode, writes to paths not in the VFS fall through to real fs
    // which throws ENOENT since the mount point doesn't exist on disk
    expect(() => fs.writeFileSync(MOUNT + "/new.txt", "created")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("Non-overlay mode should handle all paths", () => {
    const vfsNoOverlay = create({ overlay: false });
    vfsNoOverlay.mount(MOUNT + "-no-overlay");
    vfsNoOverlay.addFile(MOUNT + "-no-overlay/virtual.txt", "virtual");
    expect(fs.existsSync(MOUNT + "-no-overlay/virtual.txt")).toBe(true);
    // In non-overlay mode, creating non-existent virtual paths works
    fs.writeFileSync(MOUNT + "-no-overlay/new.txt", "created");
    expect(fs.readFileSync(MOUNT + "-no-overlay/new.txt", "utf8")).toBe(
      "created",
    );
    vfsNoOverlay.unmount();
  });
});

// ─── fs.promises advanced operations ──────────────────────────────────────────

describe("fs.promises advanced operations", () => {
  const MOUNT = "/scratchyjs-vfs-promises-adv-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    vfs.unmount();
  });

  it("fs.promises.lstat returns symlink info without following", async () => {
    vfs.addFile(MOUNT + "/target.txt", "target");
    fs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/link.txt");
    const linkStats = await fs.promises.lstat(MOUNT + "/link.txt");
    expect(linkStats.isSymbolicLink()).toBe(true);
  });

  it("fs.promises.realpath resolves symlinks", async () => {
    vfs.addFile(MOUNT + "/real.txt", "content");
    fs.symlinkSync(MOUNT + "/real.txt", MOUNT + "/symlink.txt");
    const resolved = await fs.promises.realpath(MOUNT + "/symlink.txt");
    expect(resolved).toBe(MOUNT + "/real.txt");
  });

  it("fs.promises.access succeeds for existing file", async () => {
    vfs.addFile(MOUNT + "/accessible.txt", "");
    await expect(
      fs.promises.access(MOUNT + "/accessible.txt"),
    ).resolves.toBeUndefined();
  });

  it("fs.promises.access throws for missing file", async () => {
    await expect(fs.promises.access(MOUNT + "/missing.txt")).rejects.toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("fs.promises.readlink reads symlink target", async () => {
    vfs.addFile(MOUNT + "/target.txt", "");
    fs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/link.txt");
    const target = await fs.promises.readlink(MOUNT + "/link.txt");
    expect(target).toBe(MOUNT + "/target.txt");
  });

  it("fs.promises.chmod changes file permissions", async () => {
    vfs.addFile(MOUNT + "/chmod.txt", "");
    await fs.promises.chmod(MOUNT + "/chmod.txt", 0o644);
    const stats = await fs.promises.stat(MOUNT + "/chmod.txt");
    expect(stats.mode & 0o777 & 0o600).toBe(0o600); // Check owner read/write preserved
  });

  it("fs.promises.copyFile duplicates a file", async () => {
    vfs.addFile(MOUNT + "/src.txt", "source");
    await fs.promises.copyFile(MOUNT + "/src.txt", MOUNT + "/copy.txt");
    const result = await fs.promises.readFile(MOUNT + "/copy.txt", "utf8");
    expect(result).toBe("source");
  });

  it("fs.promises.truncate shrinks a file", async () => {
    vfs.addFile(MOUNT + "/trunc.txt", "hello world");
    await fs.promises.truncate(MOUNT + "/trunc.txt", 5);
    const result = await fs.promises.readFile(MOUNT + "/trunc.txt", "utf8");
    expect(result).toBe("hello");
  });

  it("fs.promises.link creates a hard link", async () => {
    vfs.addFile(MOUNT + "/original.txt", "content");
    await fs.promises.link(MOUNT + "/original.txt", MOUNT + "/linked.txt");
    const result = await fs.promises.readFile(MOUNT + "/linked.txt", "utf8");
    expect(result).toBe("content");
  });

  it("fs.promises.rename moves a file", async () => {
    vfs.addFile(MOUNT + "/old.txt", "content");
    await fs.promises.rename(MOUNT + "/old.txt", MOUNT + "/new.txt");
    expect(fs.existsSync(MOUNT + "/old.txt")).toBe(false);
    const result = await fs.promises.readFile(MOUNT + "/new.txt", "utf8");
    expect(result).toBe("content");
  });

  it("fs.promises.symlink creates symlink", async () => {
    vfs.addFile(MOUNT + "/target.txt", "");
    await fs.promises.symlink(MOUNT + "/target.txt", MOUNT + "/link.txt");
    const target = await fs.promises.readlink(MOUNT + "/link.txt");
    expect(target).toBe(MOUNT + "/target.txt");
  });

  it("fs.promises.readdir with withFileTypes returns Dirent objects", async () => {
    vfs.addFile(MOUNT + "/file.txt", "");
    vfs.addDirectory(MOUNT + "/dir");
    const entries = await fs.promises.readdir(MOUNT, { withFileTypes: true });
    const fileEntry = entries.find((e) => e.name === "file.txt");
    expect(fileEntry?.isFile()).toBe(true);
    const dirEntry = entries.find((e) => e.name === "dir");
    expect(dirEntry?.isDirectory()).toBe(true);
  });

  it("fs.promises.readdir with recursive lists all nested files", async () => {
    vfs.addDirectory(MOUNT + "/a");
    vfs.addFile(MOUNT + "/a/f1.txt", "");
    vfs.addDirectory(MOUNT + "/a/b");
    vfs.addFile(MOUNT + "/a/b/f2.txt", "");
    const entries = await fs.promises.readdir(MOUNT, { recursive: true });
    expect(entries).toContain("a");
    expect(entries).toContain("a/f1.txt");
    expect(entries).toContain("a/b");
    expect(entries).toContain("a/b/f2.txt");
  });
});

// ─── Error conditions and edge cases ──────────────────────────────────────────

describe("error conditions", () => {
  const MOUNT = "/scratchyjs-vfs-errors-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    vfs.unmount();
  });

  it("fs.readFileSync throws ENOENT for non-existent file in VFS", () => {
    expect(() => fs.readFileSync(MOUNT + "/ghost.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("fs.readFileSync throws EISDIR when path is a directory", () => {
    vfs.addDirectory(MOUNT + "/dir");
    expect(() => fs.readFileSync(MOUNT + "/dir")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("fs.mkdirSync throws EEXIST when directory already exists without recursive", () => {
    vfs.addDirectory(MOUNT + "/existing");
    expect(() => fs.mkdirSync(MOUNT + "/existing")).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
  });

  it("fs.mkdirSync with recursive succeeds when directory exists", () => {
    vfs.addDirectory(MOUNT + "/existing");
    expect(() =>
      fs.mkdirSync(MOUNT + "/existing", { recursive: true }),
    ).not.toThrow();
  });

  it("fs.unlinkSync throws ENOENT for missing file", () => {
    expect(() => fs.unlinkSync(MOUNT + "/nonexistent.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("fs.unlinkSync throws EISDIR when path is a directory", () => {
    vfs.addDirectory(MOUNT + "/dir");
    expect(() => fs.unlinkSync(MOUNT + "/dir")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("fs.rmdirSync throws ENOTEMPTY when directory has files", () => {
    vfs.addDirectory(MOUNT + "/nonempty");
    vfs.addFile(MOUNT + "/nonempty/file.txt", "");
    expect(() => fs.rmdirSync(MOUNT + "/nonempty")).toThrow(
      expect.objectContaining({ code: "ENOTEMPTY" }),
    );
  });

  it("fs.renameSync throws ENOENT when source does not exist", () => {
    expect(() =>
      fs.renameSync(MOUNT + "/nonexistent.txt", MOUNT + "/target.txt"),
    ).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("fs.copyFileSync throws ENOENT when source does not exist", () => {
    expect(() =>
      fs.copyFileSync(MOUNT + "/nonexistent.txt", MOUNT + "/target.txt"),
    ).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("fs.statSync throws ENOENT for non-existent path", () => {
    expect(() => fs.statSync(MOUNT + "/missing.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });
});

// ─── Symlink and relative path edge cases ────────────────────────────────────

describe("symlink and path edge cases", () => {
  const MOUNT = "/scratchyjs-vfs-symlinks-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    vfs.unmount();
  });

  it("relative symlinks are preserved as-is", () => {
    vfs.addDirectory(MOUNT + "/dir");
    vfs.addFile(MOUNT + "/dir/target.txt", "target");
    fs.symlinkSync("target.txt", MOUNT + "/dir/relative-link");
    const target = fs.readlinkSync(MOUNT + "/dir/relative-link");
    expect(target).toBe("target.txt");
  });

  it("absolute symlinks are resolved relative to provider root", () => {
    vfs.addFile(MOUNT + "/absolute-target.txt", "target");
    fs.symlinkSync(MOUNT + "/absolute-target.txt", MOUNT + "/absolute-link");
    const target = fs.readlinkSync(MOUNT + "/absolute-link");
    expect(target).toBe(MOUNT + "/absolute-target.txt");
  });

  it("symlink to symlink is followed by realpathSync", () => {
    vfs.addFile(MOUNT + "/real.txt", "content");
    fs.symlinkSync(MOUNT + "/real.txt", MOUNT + "/link1.txt");
    fs.symlinkSync(MOUNT + "/link1.txt", MOUNT + "/link2.txt");
    const resolved = fs.realpathSync(MOUNT + "/link2.txt");
    expect(resolved).toBe(MOUNT + "/real.txt");
  });

  it("statSync follows symlinks to get target stats", () => {
    vfs.addFile(MOUNT + "/target.txt", "content");
    fs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/link.txt");
    const stats = fs.statSync(MOUNT + "/link.txt");
    expect(stats.isFile()).toBe(true);
    expect(stats.isSymbolicLink()).toBe(false);
  });

  it("lstatSync does not follow symlinks", () => {
    vfs.addFile(MOUNT + "/target.txt", "content");
    fs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/link.txt");
    const stats = fs.lstatSync(MOUNT + "/link.txt");
    expect(stats.isSymbolicLink()).toBe(true);
    expect(stats.isFile()).toBe(false);
  });

  it("path with . and .. segments are resolved correctly", () => {
    vfs.addDirectory(MOUNT + "/a/b");
    vfs.addFile(MOUNT + "/a/file.txt", "content");
    // resolvePath with absolute path delegates to path.resolve
    const resolved1 = vfs.resolvePath("/a/b/../file.txt");
    expect(resolved1).toBe("/a/file.txt");
  });

  it("readFileSync with path containing . works", () => {
    vfs.addFile(MOUNT + "/file.txt", "content");
    const result = fs.readFileSync(MOUNT + "/./file.txt", "utf8");
    expect(result).toBe("content");
  });
});

// ─── Advanced MemoryProvider operations ──────────────────────────────────────

describe("MemoryProvider advanced operations", () => {
  let provider: MemoryProvider;

  beforeEach(() => {
    provider = new MemoryProvider();
  });

  it("chmodSync sets file mode permissions", () => {
    provider.writeFileSync("/file.txt", "content");
    provider.chmodSync("/file.txt", 0o644);
    const stats = provider.statSync("/file.txt");
    expect(stats.mode & 0o777 & 0o600).toBe(0o600);
  });

  it("chownSync succeeds (implementation specific)", () => {
    provider.writeFileSync("/file.txt", "content");
    // chownSync should succeed without error
    expect(() => provider.chownSync("/file.txt", 1000, 1000)).not.toThrow();
  });

  it("utimesSync updates file timestamps", () => {
    provider.writeFileSync("/file.txt", "content");
    const newTime = Math.floor(Date.now() / 1000);
    provider.utimesSync("/file.txt", newTime, newTime);
    const stats = provider.statSync("/file.txt");
    expect(stats.atimeMs).toBeGreaterThan(0);
    expect(stats.mtimeMs).toBeGreaterThan(0);
  });

  it("readdirSync with recursive lists all nested entries", () => {
    provider.mkdirSync("/a");
    provider.mkdirSync("/a/b", { recursive: true });
    provider.writeFileSync("/a/file1.txt", "");
    provider.writeFileSync("/a/b/file2.txt", "");
    const entries = provider.readdirSync("/", { recursive: true }) as (
      | string
      | { name: string }
    )[];
    const names = entries.map((e) => (typeof e === "string" ? e : e.name));
    expect(names).toContain("a");
    expect(names).toContain("a/file1.txt");
    expect(names).toContain("a/b/file2.txt");
  });

  it("readdirSync with withFileTypes returns Dirent objects with proper types", () => {
    provider.mkdirSync("/mydir");
    provider.writeFileSync("/file.txt", "");
    const entries = provider.readdirSync("/", {
      withFileTypes: true,
    }) as VfsDirent[];
    const fileEntry = entries.find((e) => e.name === "file.txt");
    const dirEntry = entries.find((e) => e.name === "mydir");
    expect(fileEntry?.isFile()).toBe(true);
    expect(fileEntry?.isDirectory()).toBe(false);
    expect(dirEntry?.isDirectory()).toBe(true);
    expect(dirEntry?.isFile()).toBe(false);
  });

  it("mkdtempSync generates unique directory names", () => {
    provider.mkdirSync("/tmp", { recursive: true });
    const dir1 = provider.mkdtempSync("/tmp/prefix-");
    const dir2 = provider.mkdtempSync("/tmp/prefix-");
    expect(dir1).not.toBe(dir2);
    expect(dir1).toMatch(/^\/tmp\/prefix-/);
    expect(provider.statSync(dir1).isDirectory()).toBe(true);
  });

  it("truncateSync shrinks files to specified size", () => {
    provider.writeFileSync("/file.txt", "hello world");
    provider.truncateSync("/file.txt", 5);
    const result = provider.readFileSync("/file.txt", { encoding: "utf8" });
    expect(result).toBe("hello");
  });

  it("truncateSync expands files by padding with zeros", () => {
    provider.writeFileSync("/file.txt", "hi");
    provider.truncateSync("/file.txt", 5);
    const result = provider.readFileSync("/file.txt") as Buffer;
    expect(result.length).toBe(5);
    expect(result.toString("utf8")).toContain("hi");
  });

  it("rmSync with force ignores ENOENT errors", () => {
    expect(() =>
      provider.rmSync("/nonexistent.txt", { force: true }),
    ).not.toThrow();
  });

  it("rmSync without force throws ENOENT on missing path", () => {
    expect(() => provider.rmSync("/nonexistent.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });
});

// ─── Error factory functions (errors.ts) ─────────────────────────────────────

describe("error factory functions (errors.ts)", () => {
  it("createEBADF returns an EBADF error with no path property", () => {
    const err = createEBADF("read");
    expect(err.code).toBe("EBADF");
    expect(err.syscall).toBe("read");
    expect(err.path).toBeUndefined();
    expect(err.message).toContain("bad file descriptor");
  });

  it("createEROFS returns an EROFS error", () => {
    const err = createEROFS("write", "/file.txt");
    expect(err.code).toBe("EROFS");
    expect(err.syscall).toBe("write");
    expect(err.path).toBe("/file.txt");
    expect(err.message).toContain("read-only file system");
  });

  it("createEINVAL returns an EINVAL error", () => {
    const err = createEINVAL("readlink", "/file.txt");
    expect(err.code).toBe("EINVAL");
    expect(err.syscall).toBe("readlink");
    expect(err.message).toContain("invalid argument");
  });

  it("createELOOP returns an ELOOP error", () => {
    const err = createELOOP("lstat", "/loop");
    expect(err.code).toBe("ELOOP");
    expect(err.message).toContain("too many levels of symbolic links");
  });

  it("createEACCES returns an EACCES error", () => {
    const err = createEACCES("access", "/file.txt");
    expect(err.code).toBe("EACCES");
    expect(err.message).toContain("permission denied");
  });

  it("createEROFS is thrown when writing to a readonly MemoryProvider", () => {
    const provider = new MemoryProvider();
    provider.setReadOnly();
    expect(() => provider.writeFileSync("/f.txt", "data")).toThrow(
      expect.objectContaining({ code: "EROFS" }),
    );
  });

  it("createEINVAL is thrown by copyFileSync on a non-file source", () => {
    const provider = new MemoryProvider();
    provider.mkdirSync("/dir");
    expect(() => provider.copyFileSync("/dir", "/dest.txt")).toThrow(
      expect.objectContaining({ code: "EINVAL" }),
    );
  });

  it("createELOOP is thrown by circular symlinks", () => {
    const provider = new MemoryProvider();
    provider.symlinkSync("/link-b", "/link-a");
    provider.symlinkSync("/link-a", "/link-b");
    expect(() =>
      provider.readFileSync("/link-a", { encoding: "utf8" }),
    ).toThrow(expect.objectContaining({ code: "ELOOP" }));
  });

  it("createEACCES is thrown by accessSync when read permission denied", () => {
    const provider = new MemoryProvider();
    provider.writeFileSync("/nread.txt", "");
    provider.chmodSync("/nread.txt", 0o000);
    expect(() => provider.accessSync("/nread.txt", 4)).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
  });
});

// ─── VfsStats additional methods (stats.ts) ──────────────────────────────────

describe("VfsStats additional methods (stats.ts)", () => {
  it("isBlockDevice() always returns false", () => {
    const stats = createSymlinkStats(10);
    expect(stats.isBlockDevice()).toBe(false);
  });

  it("isCharacterDevice() always returns false", () => {
    const stats = createSymlinkStats(0);
    expect(stats.isCharacterDevice()).toBe(false);
  });

  it("isFIFO() always returns false", () => {
    const stats = createSymlinkStats(0);
    expect(stats.isFIFO()).toBe(false);
  });

  it("isSocket() always returns false", () => {
    const stats = createSymlinkStats(0);
    expect(stats.isSocket()).toBe(false);
  });

  it("createSymlinkStats produces a symlink stats object", () => {
    const stats = createSymlinkStats(12);
    expect(stats.isSymbolicLink()).toBe(true);
    expect(stats.isFile()).toBe(false);
    expect(stats.isDirectory()).toBe(false);
    expect(stats.size).toBe(12);
  });

  it("VfsStats methods also return false on a regular file stat", () => {
    const provider = new MemoryProvider();
    provider.writeFileSync("/f.txt", "hello");
    const stats = provider.statSync("/f.txt");
    expect(stats.isBlockDevice()).toBe(false);
    expect(stats.isCharacterDevice()).toBe(false);
    expect(stats.isFIFO()).toBe(false);
    expect(stats.isSocket()).toBe(false);
  });
});

// ─── router helpers (router.ts) ──────────────────────────────────────────────

describe("router helpers (router.ts)", () => {
  it("isUnderMountPoint is true when path equals mountPoint", () => {
    expect(isUnderMountPoint("/foo/bar", "/foo/bar")).toBe(true);
  });

  it("isUnderMountPoint with root '/' returns true for any absolute path", () => {
    expect(isUnderMountPoint("/foo/bar", "/")).toBe(true);
    expect(isUnderMountPoint("/anything/deep/path", "/")).toBe(true);
  });

  it("isUnderMountPoint returns false for a path not under mount", () => {
    expect(isUnderMountPoint("/other/path", "/foo")).toBe(false);
  });

  it("isUnderMountPoint handles a mountPoint that already ends with the separator", () => {
    // Simulate mountPoint ending with '/' (as on Windows 'C:\' or custom prefixes)
    const mountWithSep = "/foo/";
    expect(isUnderMountPoint("/foo/bar", mountWithSep)).toBe(true);
    expect(isUnderMountPoint("/other", mountWithSep)).toBe(false);
  });

  it("getRelativePath returns '/' when path equals mountPoint", () => {
    expect(getRelativePath("/foo/bar", "/foo/bar")).toBe("/");
  });

  it("getRelativePath returns the path unchanged when mountPoint is '/'", () => {
    expect(getRelativePath("/foo/bar", "/")).toBe("/foo/bar");
  });

  it("getRelativePath extracts the relative portion under a mount", () => {
    const rel = getRelativePath("/mount/foo/bar", "/mount");
    expect(rel).toBe("/foo/bar");
  });
});

// ─── MemoryProvider additional edge cases ────────────────────────────────────

describe("MemoryProvider additional edge cases", () => {
  let provider: MemoryProvider;

  beforeEach(() => {
    provider = new MemoryProvider();
  });

  it("readonly getter returns false on a fresh provider", () => {
    expect(provider.readonly).toBe(false);
  });

  it("setReadOnly makes readonly getter return true", () => {
    provider.setReadOnly();
    expect(provider.readonly).toBe(true);
  });

  it("setReadOnly prevents all write operations", () => {
    provider.setReadOnly();
    expect(() => provider.mkdirSync("/d")).toThrow(
      expect.objectContaining({ code: "EROFS" }),
    );
    expect(() => provider.unlinkSync("/x.txt")).toThrow();
  });

  it("VfsDirent.isSymbolicLink() returns true for symlink dirents", () => {
    provider.writeFileSync("/target.txt", "");
    provider.symlinkSync("/target.txt", "/link.txt");
    const entries = provider.readdirSync("/", {
      withFileTypes: true,
    }) as VfsDirent[];
    const linkEntry = entries.find((e) => e.name === "link.txt");
    expect(linkEntry?.isSymbolicLink()).toBe(true);
    expect(linkEntry?.isFile()).toBe(false);
    expect(linkEntry?.isDirectory()).toBe(false);
  });

  it("VfsDirent.isBlockDevice() returns false", () => {
    provider.writeFileSync("/f.txt", "");
    const entries = provider.readdirSync("/", {
      withFileTypes: true,
    }) as VfsDirent[];
    const entry = entries.find((e) => e.name === "f.txt");
    expect(entry?.isBlockDevice()).toBe(false);
  });

  it("VfsDirent.isCharacterDevice() returns false", () => {
    provider.writeFileSync("/f.txt", "");
    const entries = provider.readdirSync("/", {
      withFileTypes: true,
    }) as VfsDirent[];
    const entry = entries.find((e) => e.name === "f.txt");
    expect(entry?.isCharacterDevice()).toBe(false);
  });

  it("VfsDirent.isFIFO() returns false", () => {
    provider.writeFileSync("/f.txt", "");
    const entries = provider.readdirSync("/", {
      withFileTypes: true,
    }) as VfsDirent[];
    const entry = entries.find((e) => e.name === "f.txt");
    expect(entry?.isFIFO()).toBe(false);
  });

  it("VfsDirent.isSocket() returns false", () => {
    provider.writeFileSync("/f.txt", "");
    const entries = provider.readdirSync("/", {
      withFileTypes: true,
    }) as VfsDirent[];
    const entry = entries.find((e) => e.name === "f.txt");
    expect(entry?.isSocket()).toBe(false);
  });

  it("accessSync with R_OK mode throws EACCES when file has no read permission", () => {
    provider.writeFileSync("/nread.txt", "");
    provider.chmodSync("/nread.txt", 0o000);
    expect(() => provider.accessSync("/nread.txt", 4)).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
  });

  it("accessSync with W_OK mode throws EACCES when file is write-protected", () => {
    provider.writeFileSync("/readonly.txt", "");
    provider.chmodSync("/readonly.txt", 0o444);
    expect(() => provider.accessSync("/readonly.txt", 2)).toThrow(
      expect.objectContaining({ code: "EACCES" }),
    );
  });

  it("accessSync with mode 0 does not check permissions", () => {
    provider.writeFileSync("/f.txt", "");
    provider.chmodSync("/f.txt", 0o000);
    expect(() => provider.accessSync("/f.txt", 0)).not.toThrow();
  });

  it("writeFileSync on an existing directory throws EISDIR", () => {
    provider.mkdirSync("/mydir");
    expect(() => provider.writeFileSync("/mydir", "data")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("writeFileSync with Uint8Array data", () => {
    const data = new Uint8Array([104, 101, 108, 108, 111]); // "hello"
    provider.writeFileSync("/uint8.txt", data);
    expect(provider.readFileSync("/uint8.txt", { encoding: "utf8" })).toBe(
      "hello",
    );
  });

  it("appendFileSync on an existing directory throws EISDIR", () => {
    provider.mkdirSync("/appenddir");
    expect(() => provider.appendFileSync("/appenddir", "data")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("appendFileSync with Uint8Array data", () => {
    provider.writeFileSync("/uint8-app.txt", "hello");
    const data = new Uint8Array([32, 119, 111, 114, 108, 100]); // " world"
    provider.appendFileSync("/uint8-app.txt", data);
    expect(provider.readFileSync("/uint8-app.txt", { encoding: "utf8" })).toBe(
      "hello world",
    );
  });

  it("appendFileSync creates a new file when it does not exist", () => {
    provider.appendFileSync("/newfile.txt", "created");
    expect(provider.readFileSync("/newfile.txt", { encoding: "utf8" })).toBe(
      "created",
    );
  });

  it("copyFileSync to an existing directory throws EISDIR", () => {
    provider.writeFileSync("/src.txt", "content");
    provider.mkdirSync("/destdir");
    expect(() => provider.copyFileSync("/src.txt", "/destdir")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("copyFileSync overwrites an existing destination file", () => {
    provider.writeFileSync("/src.txt", "new");
    provider.writeFileSync("/dest.txt", "old");
    provider.copyFileSync("/src.txt", "/dest.txt");
    expect(provider.readFileSync("/dest.txt", { encoding: "utf8" })).toBe(
      "new",
    );
  });

  it("rmdirSync on a file throws ENOTDIR", () => {
    provider.writeFileSync("/f.txt", "");
    expect(() => provider.rmdirSync("/f.txt")).toThrow(
      expect.objectContaining({ code: "ENOTDIR" }),
    );
  });

  it("mkdirSync recursive throws ENOTDIR when a path component is a file", () => {
    provider.writeFileSync("/file.txt", "");
    expect(() =>
      provider.mkdirSync("/file.txt/child", { recursive: true }),
    ).toThrow(expect.objectContaining({ code: "ENOTDIR" }));
  });

  it("rmSync on a directory without recursive option throws EISDIR", () => {
    provider.mkdirSync("/rmdir");
    expect(() => provider.rmSync("/rmdir")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("rmSync removes a symlink without needing recursive", () => {
    provider.writeFileSync("/target.txt", "content");
    provider.symlinkSync("/target.txt", "/link.txt");
    provider.rmSync("/link.txt");
    expect(provider.existsSync("/link.txt")).toBe(false);
    expect(provider.existsSync("/target.txt")).toBe(true);
  });

  it("symlinkSync on an existing path throws EEXIST", () => {
    provider.writeFileSync("/existing.txt", "");
    expect(() => provider.symlinkSync("/target.txt", "/existing.txt")).toThrow(
      expect.objectContaining({ code: "EEXIST" }),
    );
  });

  it("linkSync on a directory throws EISDIR", () => {
    provider.mkdirSync("/adir");
    expect(() => provider.linkSync("/adir", "/hardlink")).toThrow(
      expect.objectContaining({ code: "EISDIR" }),
    );
  });

  it("utimesSync accepts Date objects", () => {
    provider.writeFileSync("/f.txt", "");
    const now = new Date();
    provider.utimesSync("/f.txt", now, now);
    const stats = provider.statSync("/f.txt");
    expect(stats.atimeMs).toBeGreaterThan(0);
    expect(stats.mtimeMs).toBeGreaterThan(0);
  });

  it("chmodSync with a string octal mode", () => {
    provider.writeFileSync("/mode.txt", "");
    provider.chmodSync("/mode.txt", "755");
    const stats = provider.statSync("/mode.txt");
    expect(stats.mode & 0o777).toBe(0o755);
  });

  it("relative symlink target is resolved correctly", () => {
    provider.mkdirSync("/dir");
    provider.writeFileSync("/dir/target.txt", "relative target");
    provider.symlinkSync("target.txt", "/dir/rel-link");
    const result = provider.readFileSync("/dir/rel-link", { encoding: "utf8" });
    expect(result).toBe("relative target");
  });

  it("circular symlinks throw ELOOP", () => {
    provider.symlinkSync("/link-b", "/link-a");
    provider.symlinkSync("/link-a", "/link-b");
    expect(() => provider.statSync("/link-a")).toThrow(
      expect.objectContaining({ code: "ELOOP" }),
    );
  });

  it("accessing a path where a file appears mid-path throws ENOENT", () => {
    provider.writeFileSync("/file.txt", "content");
    expect(() =>
      provider.readFileSync("/file.txt/nested", { encoding: "utf8" }),
    ).toThrow(expect.objectContaining({ code: "ENOENT" }));
  });

  it("readdirSync recursive lists entries inside a symlinked directory", () => {
    provider.mkdirSync("/src");
    provider.writeFileSync("/src/file.txt", "");
    provider.mkdirSync("/linkdest");
    provider.writeFileSync("/linkdest/nested.txt", "");
    provider.symlinkSync("/linkdest", "/src/symlink-dir");
    const entries = provider.readdirSync("/src", {
      recursive: true,
    }) as string[];
    expect(entries).toContain("file.txt");
    expect(entries.some((e) => e.includes("symlink-dir"))).toBe(true);
  });

  it("mkdtemp async wrapper returns same result as mkdtempSync", async () => {
    provider.mkdirSync("/tmp");
    const dir = await provider.mkdtemp("/tmp/test-");
    expect(provider.statSync(dir).isDirectory()).toBe(true);
    expect(dir).toMatch(/^\/tmp\/test-/);
  });

  it("async rmdir wrapper removes an empty directory", async () => {
    provider.mkdirSync("/asyncdir");
    await provider.rmdir("/asyncdir");
    expect(provider.existsSync("/asyncdir")).toBe(false);
  });

  it("async chown wrapper succeeds", async () => {
    provider.writeFileSync("/chown.txt", "");
    await expect(
      provider.chown("/chown.txt", 1000, 1000),
    ).resolves.toBeUndefined();
  });
});

// ─── VirtualFileSystem direct method calls (mounted) ─────────────────────────

describe("VirtualFileSystem direct method calls (mounted)", () => {
  const MOUNT = "/scratchyjs-vfs-direct-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("vfs.overlay getter returns false by default", () => {
    expect(vfs.overlay).toBe(false);
  });

  it("vfs.overlay getter returns true when created with overlay:true", () => {
    const overlayVfs = create({ overlay: true });
    overlayVfs.mount(MOUNT + "-ov");
    expect(overlayVfs.overlay).toBe(true);
    overlayVfs.unmount();
  });

  it("vfs.virtualCwdEnabled getter returns false by default", () => {
    expect(vfs.virtualCwdEnabled).toBe(false);
  });

  it("vfs.virtualCwdEnabled getter returns true when created with virtualCwd:true", () => {
    const cwdVfs = create({ virtualCwd: true });
    cwdVfs.mount(MOUNT + "-vcwd");
    expect(cwdVfs.virtualCwdEnabled).toBe(true);
    cwdVfs.unmount();
  });

  it("chdir() without virtualCwd enabled throws ERR_INVALID_STATE", () => {
    expect(() => vfs.chdir(MOUNT)).toThrow(
      expect.objectContaining({ code: "ERR_INVALID_STATE" }),
    );
  });

  it("resolvePath() without virtualCwd resolves absolute paths via path.resolve", () => {
    const resolved = vfs.resolvePath(MOUNT + "/file.txt");
    expect(resolved).toBe(MOUNT + "/file.txt");
  });

  it("vfs.existsSync() returns false for a path outside the mount (catch block)", () => {
    expect(vfs.existsSync("/completely-different-root/file.txt")).toBe(false);
  });

  it("vfs.lstatSync() returns symlink stats without following the link", () => {
    vfs.addFile(MOUNT + "/target.txt", "t");
    fs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/sym-direct.txt");
    const stats = vfs.lstatSync(MOUNT + "/sym-direct.txt");
    expect(stats.isSymbolicLink()).toBe(true);
  });

  it("vfs.readFileSync() reads a file directly", () => {
    vfs.addFile(MOUNT + "/read.txt", "direct read");
    expect(vfs.readFileSync(MOUNT + "/read.txt", "utf8")).toBe("direct read");
  });

  it("vfs.writeFileSync() writes a file directly", () => {
    vfs.writeFileSync(MOUNT + "/write.txt", "direct write");
    expect(vfs.readFileSync(MOUNT + "/write.txt", "utf8")).toBe("direct write");
  });

  it("vfs.appendFileSync() appends to a file directly", () => {
    vfs.addFile(MOUNT + "/app.txt", "first");
    vfs.appendFileSync(MOUNT + "/app.txt", " second");
    expect(vfs.readFileSync(MOUNT + "/app.txt", "utf8")).toBe("first second");
  });

  it("vfs.readdirSync() lists a directory directly", () => {
    vfs.addDirectory(MOUNT + "/rdir");
    vfs.addFile(MOUNT + "/rdir/a.txt", "");
    const entries = vfs.readdirSync(MOUNT + "/rdir") as string[];
    expect(entries).toContain("a.txt");
  });

  it("vfs.mkdirSync() creates a directory directly", () => {
    vfs.mkdirSync(MOUNT + "/newdir");
    expect(vfs.statSync(MOUNT + "/newdir").isDirectory()).toBe(true);
  });

  it("vfs.mkdirSync() recursive returns the first-created mounted path", () => {
    const first = vfs.mkdirSync(MOUNT + "/a/b/c", { recursive: true });
    expect(first).toContain(MOUNT + "/a");
    expect(vfs.statSync(MOUNT + "/a/b/c").isDirectory()).toBe(true);
  });

  it("vfs.rmdirSync() removes an empty directory directly", () => {
    vfs.addDirectory(MOUNT + "/rmdir");
    vfs.rmdirSync(MOUNT + "/rmdir");
    expect(vfs.existsSync(MOUNT + "/rmdir")).toBe(false);
  });

  it("vfs.rmSync() removes a file directly", () => {
    vfs.addFile(MOUNT + "/rm.txt", "");
    vfs.rmSync(MOUNT + "/rm.txt");
    expect(vfs.existsSync(MOUNT + "/rm.txt")).toBe(false);
  });

  it("vfs.unlinkSync() removes a file directly", () => {
    vfs.addFile(MOUNT + "/unlink.txt", "");
    vfs.unlinkSync(MOUNT + "/unlink.txt");
    expect(vfs.existsSync(MOUNT + "/unlink.txt")).toBe(false);
  });

  it("vfs.renameSync() renames a file directly", () => {
    vfs.addFile(MOUNT + "/old.txt", "content");
    vfs.renameSync(MOUNT + "/old.txt", MOUNT + "/new.txt");
    expect(vfs.existsSync(MOUNT + "/old.txt")).toBe(false);
    expect(vfs.readFileSync(MOUNT + "/new.txt", "utf8")).toBe("content");
  });

  it("vfs.copyFileSync() copies a file directly", () => {
    vfs.addFile(MOUNT + "/src.txt", "copy");
    vfs.copyFileSync(MOUNT + "/src.txt", MOUNT + "/dst.txt");
    expect(vfs.readFileSync(MOUNT + "/dst.txt", "utf8")).toBe("copy");
  });

  it("vfs.symlinkSync() creates a symlink directly", () => {
    vfs.addFile(MOUNT + "/target.txt", "");
    vfs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/link.txt");
    expect(vfs.lstatSync(MOUNT + "/link.txt").isSymbolicLink()).toBe(true);
  });

  it("vfs.readlinkSync() reads a symlink target directly", () => {
    vfs.addFile(MOUNT + "/target.txt", "");
    vfs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/link.txt");
    expect(vfs.readlinkSync(MOUNT + "/link.txt")).toBe(MOUNT + "/target.txt");
  });

  it("vfs.realpathSync() resolves a symlink directly", () => {
    vfs.addFile(MOUNT + "/real.txt", "");
    vfs.symlinkSync(MOUNT + "/real.txt", MOUNT + "/sym.txt");
    expect(vfs.realpathSync(MOUNT + "/sym.txt")).toBe(MOUNT + "/real.txt");
  });

  it("vfs.accessSync() checks access directly without throwing", () => {
    vfs.addFile(MOUNT + "/access.txt", "");
    expect(() => vfs.accessSync(MOUNT + "/access.txt")).not.toThrow();
  });

  it("vfs.chmodSync() changes mode directly", () => {
    vfs.addFile(MOUNT + "/chmod.txt", "");
    vfs.chmodSync(MOUNT + "/chmod.txt", 0o600);
    expect(vfs.statSync(MOUNT + "/chmod.txt").mode & 0o777).toBe(0o600);
  });

  it("vfs.chownSync() changes ownership directly", () => {
    vfs.addFile(MOUNT + "/chown.txt", "");
    expect(() => vfs.chownSync(MOUNT + "/chown.txt", 1000, 1000)).not.toThrow();
  });

  it("vfs.utimesSync() updates timestamps directly", () => {
    vfs.addFile(MOUNT + "/utimes.txt", "");
    vfs.utimesSync(MOUNT + "/utimes.txt", new Date(), new Date());
    expect(vfs.statSync(MOUNT + "/utimes.txt").atimeMs).toBeGreaterThan(0);
  });

  it("vfs.mkdtempSync() creates a temp directory directly", () => {
    vfs.addDirectory(MOUNT + "/tmp");
    const dir = vfs.mkdtempSync(MOUNT + "/tmp/pfx-");
    expect(vfs.statSync(dir).isDirectory()).toBe(true);
    expect(dir.startsWith(MOUNT + "/tmp/pfx-")).toBe(true);
  });

  it("vfs.truncateSync() truncates a file directly", () => {
    vfs.addFile(MOUNT + "/trunc.txt", "hello world");
    vfs.truncateSync(MOUNT + "/trunc.txt", 5);
    expect(vfs.readFileSync(MOUNT + "/trunc.txt", "utf8")).toBe("hello");
  });

  it("vfs.linkSync() creates a hard link directly", () => {
    vfs.addFile(MOUNT + "/original.txt", "shared");
    vfs.linkSync(MOUNT + "/original.txt", MOUNT + "/hardlink.txt");
    expect(vfs.readFileSync(MOUNT + "/hardlink.txt", "utf8")).toBe("shared");
  });

  it("addFile() with Buffer content (DirHelper L83 false branch)", () => {
    // When content is a Buffer, makeDirHelper takes the `else content` branch
    // (L83[0] = false in `typeof content === "string" ? … : content`)
    vfs.addFile(MOUNT + "/buffile.txt", Buffer.from("buffer data"));
    expect(vfs.readFileSync(MOUNT + "/buffile.txt", "utf8")).toBe(
      "buffer data",
    );
  });

  it("addFile() with Buffer content via addDirectory populate callback (makeDirHelper L83)", () => {
    vfs.addDirectory(MOUNT + "/bufdir", (dir) => {
      dir.addFile("buf.txt", Buffer.from("cb-buffer"));
    });
    expect(vfs.readFileSync(MOUNT + "/bufdir/buf.txt", "utf8")).toBe(
      "cb-buffer",
    );
  });

  it("vfs.readlinkSync() returns a relative target unchanged (L431 false branch)", () => {
    // pathPosix.isAbsolute("target.txt") === false →
    // the else branch returns result as-is (L431[0])
    vfs.addDirectory(MOUNT + "/rl-dir");
    vfs.addFile(MOUNT + "/rl-dir/target.txt", "data");
    vfs.symlinkSync("target.txt", MOUNT + "/rl-dir/rel-link.txt");
    expect(vfs.readlinkSync(MOUNT + "/rl-dir/rel-link.txt")).toBe("target.txt");
  });

  it("addDirectory with a populate callback that also calls addDirectory", () => {
    vfs.addDirectory(MOUNT + "/root", (rootDir) => {
      rootDir.addDirectory("sub", (subDir) => {
        subDir.addFile("deep.txt", "deep content");
      });
    });
    expect(vfs.existsSync(MOUNT + "/root/sub")).toBe(true);
    expect(vfs.readFileSync(MOUNT + "/root/sub/deep.txt", "utf8")).toBe(
      "deep content",
    );
  });
});

// ─── VirtualFileSystem mkdirSync pre-mount #toMountedPath ────────────────────

describe("VirtualFileSystem mkdirSync pre-mount", () => {
  it("mkdirSync recursive pre-mount returns the provider path (non-mounted)", () => {
    const vfs = create();
    const first = vfs.mkdirSync("/a/b/c", { recursive: true });
    // Not mounted — #toMountedPath returns the provider path unchanged
    expect(first).toBe("/a");
    expect(vfs.statSync("/a/b/c").isDirectory()).toBe(true);
  });
});

// ─── VirtualFileSystem promises getter (mounted) ──────────────────────────────

describe("VirtualFileSystem promises getter (mounted)", () => {
  const MOUNT = "/scratchyjs-vfs-prom-get-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("vfs.promises.readFile reads a file", async () => {
    vfs.addFile(MOUNT + "/async.txt", "async-data");
    const result = await vfs.promises.readFile(MOUNT + "/async.txt", "utf8");
    expect(result).toBe("async-data");
  });

  it("vfs.promises.writeFile writes a file", async () => {
    await vfs.promises.writeFile(MOUNT + "/wfile.txt", "written");
    expect(vfs.readFileSync(MOUNT + "/wfile.txt", "utf8")).toBe("written");
  });

  it("vfs.promises.appendFile appends to a file", async () => {
    vfs.addFile(MOUNT + "/app.txt", "hello");
    await vfs.promises.appendFile(MOUNT + "/app.txt", " world");
    expect(vfs.readFileSync(MOUNT + "/app.txt", "utf8")).toBe("hello world");
  });

  it("vfs.promises.stat returns isFile() stats", async () => {
    vfs.addFile(MOUNT + "/s.txt", "");
    const stats = await vfs.promises.stat(MOUNT + "/s.txt");
    expect(stats.isFile()).toBe(true);
  });

  it("vfs.promises.lstat returns symlink stats without following", async () => {
    vfs.addFile(MOUNT + "/target.txt", "");
    vfs.symlinkSync(MOUNT + "/target.txt", MOUNT + "/link.txt");
    const stats = await vfs.promises.lstat(MOUNT + "/link.txt");
    expect(stats.isSymbolicLink()).toBe(true);
  });

  it("vfs.promises.readdir lists directory entries", async () => {
    vfs.addDirectory(MOUNT + "/pdir");
    vfs.addFile(MOUNT + "/pdir/a.txt", "");
    const entries = await vfs.promises.readdir(MOUNT + "/pdir");
    expect(entries).toContain("a.txt");
  });

  it("vfs.promises.mkdir creates a directory and returns undefined for existing paths", async () => {
    const result = await vfs.promises.mkdir(MOUNT + "/newdir");
    expect(result).toBeUndefined();
    expect(vfs.statSync(MOUNT + "/newdir").isDirectory()).toBe(true);
  });

  it("vfs.promises.mkdir recursive returns the first-created mounted path", async () => {
    const result = await vfs.promises.mkdir(MOUNT + "/a/b/c", {
      recursive: true,
    });
    expect(result).toContain(MOUNT + "/a");
  });

  it("vfs.promises.rmdir removes an empty directory", async () => {
    vfs.addDirectory(MOUNT + "/prmdir");
    await vfs.promises.rmdir(MOUNT + "/prmdir");
    expect(vfs.existsSync(MOUNT + "/prmdir")).toBe(false);
  });

  it("vfs.promises.rm removes a file", async () => {
    vfs.addFile(MOUNT + "/prm.txt", "");
    await vfs.promises.rm(MOUNT + "/prm.txt");
    expect(vfs.existsSync(MOUNT + "/prm.txt")).toBe(false);
  });

  it("vfs.promises.unlink removes a file", async () => {
    vfs.addFile(MOUNT + "/punlink.txt", "");
    await vfs.promises.unlink(MOUNT + "/punlink.txt");
    expect(vfs.existsSync(MOUNT + "/punlink.txt")).toBe(false);
  });

  it("vfs.promises.rename renames a file", async () => {
    vfs.addFile(MOUNT + "/pold.txt", "content");
    await vfs.promises.rename(MOUNT + "/pold.txt", MOUNT + "/pnew.txt");
    expect(vfs.existsSync(MOUNT + "/pold.txt")).toBe(false);
    expect(await vfs.promises.readFile(MOUNT + "/pnew.txt", "utf8")).toBe(
      "content",
    );
  });

  it("vfs.promises.copyFile copies a file", async () => {
    vfs.addFile(MOUNT + "/psrc.txt", "source");
    await vfs.promises.copyFile(MOUNT + "/psrc.txt", MOUNT + "/pdst.txt");
    expect(await vfs.promises.readFile(MOUNT + "/pdst.txt", "utf8")).toBe(
      "source",
    );
  });

  it("vfs.promises.symlink creates a symlink", async () => {
    vfs.addFile(MOUNT + "/ptarget.txt", "");
    await vfs.promises.symlink(MOUNT + "/ptarget.txt", MOUNT + "/plink.txt");
    expect(
      (await vfs.promises.lstat(MOUNT + "/plink.txt")).isSymbolicLink(),
    ).toBe(true);
  });

  it("vfs.promises.readlink reads a symlink target", async () => {
    vfs.addFile(MOUNT + "/ptarget.txt", "");
    // vfs.promises.symlink stores the raw target string so readlink returns it as-is
    await vfs.promises.symlink(MOUNT + "/ptarget.txt", MOUNT + "/plink2.txt");
    expect(await vfs.promises.readlink(MOUNT + "/plink2.txt")).toBe(
      MOUNT + "/ptarget.txt",
    );
  });

  it("vfs.promises.realpath resolves a symlink", async () => {
    vfs.addFile(MOUNT + "/preal.txt", "");
    vfs.symlinkSync(MOUNT + "/preal.txt", MOUNT + "/psym.txt");
    expect(await vfs.promises.realpath(MOUNT + "/psym.txt")).toBe(
      MOUNT + "/preal.txt",
    );
  });

  it("vfs.promises.access resolves for an accessible file", async () => {
    vfs.addFile(MOUNT + "/paccess.txt", "");
    await expect(
      vfs.promises.access(MOUNT + "/paccess.txt"),
    ).resolves.toBeUndefined();
  });

  it("vfs.promises.chmod changes file permissions", async () => {
    vfs.addFile(MOUNT + "/pchmod.txt", "");
    await vfs.promises.chmod(MOUNT + "/pchmod.txt", 0o600);
    const mode = vfs.statSync(MOUNT + "/pchmod.txt").mode;
    expect(mode & 0o777).toBe(0o600);
  });

  it("vfs.promises.chown succeeds", async () => {
    vfs.addFile(MOUNT + "/pchown.txt", "");
    await expect(
      vfs.promises.chown(MOUNT + "/pchown.txt", 1000, 1000),
    ).resolves.toBeUndefined();
  });

  it("vfs.promises.utimes updates timestamps", async () => {
    vfs.addFile(MOUNT + "/putimes.txt", "");
    await vfs.promises.utimes(MOUNT + "/putimes.txt", new Date(), new Date());
    expect(vfs.statSync(MOUNT + "/putimes.txt").atimeMs).toBeGreaterThan(0);
  });

  it("vfs.promises.mkdtemp creates a temp directory", async () => {
    vfs.addDirectory(MOUNT + "/ptmp");
    const dir = await vfs.promises.mkdtemp(MOUNT + "/ptmp/p-");
    expect(vfs.statSync(dir).isDirectory()).toBe(true);
  });

  it("vfs.promises.truncate truncates a file", async () => {
    vfs.addFile(MOUNT + "/ptrunc.txt", "hello world");
    await vfs.promises.truncate(MOUNT + "/ptrunc.txt", 5);
    expect(await vfs.promises.readFile(MOUNT + "/ptrunc.txt", "utf8")).toBe(
      "hello",
    );
  });

  it("vfs.promises.link creates a hard link", async () => {
    vfs.addFile(MOUNT + "/poriginal.txt", "content");
    await vfs.promises.link(MOUNT + "/poriginal.txt", MOUNT + "/plinked.txt");
    expect(await vfs.promises.readFile(MOUNT + "/plinked.txt", "utf8")).toBe(
      "content",
    );
  });
});

// ─── fs sync hooks: new operations via VFS path ──────────────────────────────

describe("fs sync hooks: new operations via VFS path", () => {
  const MOUNT = "/scratchyjs-vfs-newhooks-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("fs.chmodSync changes a virtual file's permissions", () => {
    vfs.addFile(MOUNT + "/chmod.txt", "");
    fs.chmodSync(MOUNT + "/chmod.txt", 0o600);
    expect(fs.statSync(MOUNT + "/chmod.txt").mode & 0o777).toBe(0o600);
  });

  it("fs.chownSync succeeds for a virtual file", () => {
    vfs.addFile(MOUNT + "/chown.txt", "");
    expect(() => fs.chownSync(MOUNT + "/chown.txt", 1000, 1000)).not.toThrow();
  });

  it("fs.utimesSync updates timestamps of a virtual file", () => {
    vfs.addFile(MOUNT + "/utimes.txt", "");
    const now = new Date();
    fs.utimesSync(MOUNT + "/utimes.txt", now, now);
    expect(fs.statSync(MOUNT + "/utimes.txt").atimeMs).toBeGreaterThan(0);
  });

  it("fs.accessSync succeeds for an accessible virtual file", () => {
    vfs.addFile(MOUNT + "/access.txt", "");
    expect(() => fs.accessSync(MOUNT + "/access.txt")).not.toThrow();
  });

  it("fs.mkdtempSync creates a virtual temp directory", () => {
    vfs.addDirectory(MOUNT + "/tmp");
    const dir = fs.mkdtempSync(MOUNT + "/tmp/pre-");
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it("fs.truncateSync truncates a virtual file", () => {
    vfs.addFile(MOUNT + "/trunc.txt", "hello world");
    fs.truncateSync(MOUNT + "/trunc.txt", 5);
    expect(fs.readFileSync(MOUNT + "/trunc.txt", "utf8")).toBe("hello");
  });

  it("fs.linkSync creates a hard link in the virtual FS", () => {
    vfs.addFile(MOUNT + "/orig.txt", "content");
    fs.linkSync(MOUNT + "/orig.txt", MOUNT + "/linked.txt");
    expect(fs.readFileSync(MOUNT + "/linked.txt", "utf8")).toBe("content");
  });

  it("fs.mkdirSync with recursive:true returns the first-created mounted path (L750 non-undefined branch)", () => {
    // provider.mkdirSync returns the first new path; the hook wraps it with
    // #toMountedPath.  This covers the `result !== undefined` true branch (L750[0]).
    const first = fs.mkdirSync(MOUNT + "/mk-r/a/b", { recursive: true });
    expect(typeof first).toBe("string");
    expect(first).toContain(MOUNT + "/mk-r");
    expect(fs.statSync(MOUNT + "/mk-r/a/b").isDirectory()).toBe(true);
  });
});

// ─── fs sync hooks: fallback to real fs ──────────────────────────────────────

describe("fs sync hooks: fallback to real fs for non-VFS paths", () => {
  const MOUNT = "/scratchyjs-vfs-fallback-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("fs.readFileSync falls through to real fs for non-VFS path", () => {
    // package.json exists in the real filesystem at the project root
    const content = fs.readFileSync(
      join(process.cwd(), "package.json"),
      "utf8",
    );
    expect(content).toBeTruthy();
  });

  it("fs.statSync falls through to real fs for non-VFS path", () => {
    const stats = fs.statSync(join(process.cwd(), "package.json"));
    expect(stats.isFile()).toBe(true);
  });

  it("fs.lstatSync falls through to real fs for non-VFS path", () => {
    const stats = fs.lstatSync(join(process.cwd(), "package.json"));
    expect(stats.isFile()).toBe(true);
  });

  it("fs.readdirSync falls through to real fs for non-VFS path", () => {
    const entries = fs.readdirSync(process.cwd());
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("fs.writeFileSync falls through to real fs (throws for non-existent parent)", () => {
    // This path doesn't exist on the real fs so ENOENT is thrown.
    // What matters is the fallback branch is executed.
    expect(() =>
      fs.writeFileSync("/definitely-not-vfs-dir/file.txt", "data"),
    ).toThrow();
  });

  it("fs.appendFileSync falls through to real fs (throws for non-existent parent)", () => {
    expect(() =>
      fs.appendFileSync("/definitely-not-vfs-dir/file.txt", "data"),
    ).toThrow();
  });

  it("fs.mkdirSync falls through to real fs and creates a temp dir", () => {
    const tmpPath = join(tmpdir(), "vfs-fallback-mkdir-" + Date.now());
    try {
      fs.mkdirSync(tmpPath);
      expect(fs.statSync(tmpPath).isDirectory()).toBe(true);
    } finally {
      try {
        fs.rmdirSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("fs.rmdirSync falls through to real fs (throws for non-existent path)", () => {
    expect(() => fs.rmdirSync("/definitely-not-vfs-dir/sub")).toThrow();
  });

  it("fs.rmSync falls through to real fs (force mode silences ENOENT)", () => {
    expect(() =>
      fs.rmSync("/definitely-not-vfs-dir/sub", { force: true }),
    ).not.toThrow();
  });

  it("fs.unlinkSync falls through to real fs (throws for non-existent file)", () => {
    expect(() => fs.unlinkSync("/definitely-not-vfs-dir/file.txt")).toThrow();
  });

  it("fs.renameSync throws EXDEV when src is virtual and dest is real", () => {
    vfs.addFile(MOUNT + "/file.txt", "content");
    expect(() =>
      fs.renameSync(MOUNT + "/file.txt", "/tmp/vfs-exdev-rename-target.txt"),
    ).toThrow(expect.objectContaining({ code: "EXDEV" }));
  });

  it("fs.renameSync falls through to real fs when both paths are outside VFS", () => {
    const src = join(tmpdir(), "vfs-rename-src-" + Date.now() + ".txt");
    const dest = join(tmpdir(), "vfs-rename-dst-" + Date.now() + ".txt");
    fs.writeFileSync(src, "rename test");
    try {
      fs.renameSync(src, dest);
      expect(fs.readFileSync(dest, "utf8")).toBe("rename test");
    } finally {
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
    }
  });

  it("fs.copyFileSync throws EXDEV when src is virtual and dest is real", () => {
    vfs.addFile(MOUNT + "/copy-src.txt", "content");
    expect(() =>
      fs.copyFileSync(
        MOUNT + "/copy-src.txt",
        "/tmp/vfs-exdev-copy-target.txt",
      ),
    ).toThrow(expect.objectContaining({ code: "EXDEV" }));
  });

  it("fs.copyFileSync falls through to real fs when src is outside VFS", () => {
    const src = join(tmpdir(), "vfs-copy-src-" + Date.now() + ".txt");
    const dest = join(tmpdir(), "vfs-copy-dst-" + Date.now() + ".txt");
    fs.writeFileSync(src, "copy test");
    try {
      fs.copyFileSync(src, dest);
      expect(fs.readFileSync(dest, "utf8")).toBe("copy test");
    } finally {
      try {
        fs.unlinkSync(src);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
    }
  });

  it("fs.symlinkSync falls through to real fs (throws for non-existent parent)", () => {
    expect(() =>
      fs.symlinkSync("/target", "/definitely-not-vfs-dir/link.txt"),
    ).toThrow();
  });

  it("fs.chmodSync falls through to real fs for non-VFS path", () => {
    const tmp = join(tmpdir(), "vfs-chmod-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "");
    try {
      expect(() => fs.chmodSync(tmp, 0o644)).not.toThrow();
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.chownSync falls through to real fs for non-VFS path", () => {
    // chownSync on a file we own should work (uid/gid = same as current process)
    const tmp = join(tmpdir(), "vfs-chown-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "");
    try {
      // Use current uid/gid so we don't need root
      const stats = fs.statSync(tmp);
      expect(() => fs.chownSync(tmp, stats.uid, stats.gid)).not.toThrow();
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.utimesSync falls through to real fs for non-VFS path", () => {
    const tmp = join(tmpdir(), "vfs-utimes-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "");
    try {
      expect(() => fs.utimesSync(tmp, new Date(), new Date())).not.toThrow();
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.realpathSync falls through to real fs for non-VFS path", () => {
    const real = fs.realpathSync(process.cwd());
    expect(real).toBeTruthy();
  });

  it("fs.readlinkSync falls through to real fs (throws for non-symlink)", () => {
    expect(() =>
      fs.readlinkSync(join(process.cwd(), "package.json")),
    ).toThrow();
  });

  it("fs.accessSync falls through to real fs for non-VFS path", () => {
    expect(() =>
      fs.accessSync(join(process.cwd(), "package.json")),
    ).not.toThrow();
  });

  it("fs.mkdtempSync falls through to real fs for non-VFS prefix", () => {
    const dir = fs.mkdtempSync(join(tmpdir(), "vfs-mkdtemp-"));
    try {
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    } finally {
      try {
        fs.rmdirSync(dir);
      } catch {
        // ignore
      }
    }
  });

  it("fs.truncateSync falls through to real fs for non-VFS path", () => {
    const tmp = join(tmpdir(), "vfs-truncate-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "hello world");
    try {
      fs.truncateSync(tmp, 5);
      expect(fs.readFileSync(tmp, "utf8")).toBe("hello");
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.linkSync falls through to real fs for non-VFS path", () => {
    const src = join(tmpdir(), "vfs-link-src-" + Date.now() + ".txt");
    const dest = join(tmpdir(), "vfs-link-dst-" + Date.now() + ".txt");
    fs.writeFileSync(src, "link test");
    try {
      fs.linkSync(src, dest);
      expect(fs.readFileSync(dest, "utf8")).toBe("link test");
    } finally {
      try {
        fs.unlinkSync(src);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
    }
  });
});

// ─── fs.promises additional coverage ─────────────────────────────────────────

describe("fs.promises additional coverage via mount", () => {
  const MOUNT = "/scratchyjs-vfs-prom-extra-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("fs.promises.appendFile appends to a virtual file", async () => {
    vfs.addFile(MOUNT + "/app.txt", "hello");
    await fs.promises.appendFile(MOUNT + "/app.txt", " world");
    expect(fs.readFileSync(MOUNT + "/app.txt", "utf8")).toBe("hello world");
  });

  it("fs.promises.appendFile creates a new virtual file when it does not exist", async () => {
    await fs.promises.appendFile(MOUNT + "/new-app.txt", "created");
    expect(fs.readFileSync(MOUNT + "/new-app.txt", "utf8")).toBe("created");
  });

  it("fs.promises.appendFile falls through to real fs for non-VFS path", async () => {
    const tmp = join(tmpdir(), "vfs-prom-append-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "hello");
    try {
      await fs.promises.appendFile(tmp, " world");
      expect(fs.readFileSync(tmp, "utf8")).toBe("hello world");
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.stat falls through to real fs for non-VFS path", async () => {
    const stats = await fs.promises.stat(join(process.cwd(), "package.json"));
    expect(stats.isFile()).toBe(true);
  });

  it("fs.promises.lstat falls through to real fs for non-VFS path", async () => {
    const stats = await fs.promises.lstat(join(process.cwd(), "package.json"));
    expect(stats.isFile()).toBe(true);
  });

  it("fs.promises.readdir falls through to real fs for non-VFS path", async () => {
    const entries = await fs.promises.readdir(process.cwd());
    expect(Array.isArray(entries)).toBe(true);
  });

  it("fs.promises.rmdir removes a virtual directory", async () => {
    vfs.addDirectory(MOUNT + "/prmdir");
    await fs.promises.rmdir(MOUNT + "/prmdir");
    expect(fs.existsSync(MOUNT + "/prmdir")).toBe(false);
  });

  it("fs.promises.rmdir falls through to real fs (throws for non-existent path)", async () => {
    await expect(
      fs.promises.rmdir("/definitely-not-vfs-dir/sub"),
    ).rejects.toThrow();
  });

  it("fs.promises.rm falls through to real fs (force silences ENOENT)", async () => {
    await expect(
      fs.promises.rm("/definitely-not-vfs-dir/sub", { force: true }),
    ).resolves.toBeUndefined();
  });

  it("fs.promises.unlink falls through to real fs (throws for non-existent path)", async () => {
    await expect(
      fs.promises.unlink("/definitely-not-vfs-dir/file.txt"),
    ).rejects.toThrow();
  });

  it("fs.promises.rename falls through to real fs for non-VFS paths", async () => {
    const src = join(tmpdir(), "vfs-prom-rename-src-" + Date.now() + ".txt");
    const dest = join(tmpdir(), "vfs-prom-rename-dst-" + Date.now() + ".txt");
    fs.writeFileSync(src, "rename");
    try {
      await fs.promises.rename(src, dest);
      expect(fs.readFileSync(dest, "utf8")).toBe("rename");
    } finally {
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.copyFile falls through to real fs for non-VFS paths", async () => {
    const src = join(tmpdir(), "vfs-prom-copy-src-" + Date.now() + ".txt");
    const dest = join(tmpdir(), "vfs-prom-copy-dst-" + Date.now() + ".txt");
    fs.writeFileSync(src, "copy");
    try {
      await fs.promises.copyFile(src, dest);
      expect(fs.readFileSync(dest, "utf8")).toBe("copy");
    } finally {
      try {
        fs.unlinkSync(src);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.symlink falls through to real fs (throws for non-existent parent)", async () => {
    await expect(
      fs.promises.symlink("/target", "/definitely-not-vfs-dir/link.txt"),
    ).rejects.toThrow();
  });

  it("fs.promises.readFile falls through to real fs for non-VFS path", async () => {
    const content = await fs.promises.readFile(
      join(process.cwd(), "package.json"),
      "utf8",
    );
    expect(content).toBeTruthy();
  });

  it("fs.promises.writeFile falls through to real fs for non-VFS path", async () => {
    const tmp = join(tmpdir(), "vfs-prom-write-" + Date.now() + ".txt");
    try {
      await fs.promises.writeFile(tmp, "written");
      expect(fs.readFileSync(tmp, "utf8")).toBe("written");
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.chmod falls through to real fs for non-VFS path", async () => {
    const tmp = join(tmpdir(), "vfs-prom-chmod-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "");
    try {
      await expect(fs.promises.chmod(tmp, 0o644)).resolves.toBeUndefined();
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.chown handles a virtual file", async () => {
    vfs.addFile(MOUNT + "/pchown.txt", "");
    await expect(
      fs.promises.chown(MOUNT + "/pchown.txt", 1000, 1000),
    ).resolves.toBeUndefined();
  });

  it("fs.promises.chown falls through to real fs for non-VFS path", async () => {
    const tmp = join(tmpdir(), "vfs-prom-chown-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "");
    try {
      const stats = fs.statSync(tmp);
      await expect(
        fs.promises.chown(tmp, stats.uid, stats.gid),
      ).resolves.toBeUndefined();
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.utimes handles a virtual file", async () => {
    vfs.addFile(MOUNT + "/putimes.txt", "");
    await expect(
      fs.promises.utimes(MOUNT + "/putimes.txt", new Date(), new Date()),
    ).resolves.toBeUndefined();
  });

  it("fs.promises.utimes falls through to real fs for non-VFS path", async () => {
    const tmp = join(tmpdir(), "vfs-prom-utimes-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "");
    try {
      await expect(
        fs.promises.utimes(tmp, new Date(), new Date()),
      ).resolves.toBeUndefined();
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.mkdtemp handles a virtual prefix", async () => {
    vfs.addDirectory(MOUNT + "/ptmp");
    const dir = await fs.promises.mkdtemp(MOUNT + "/ptmp/p-");
    expect(fs.statSync(dir).isDirectory()).toBe(true);
  });

  it("fs.promises.mkdtemp falls through to real fs for non-VFS prefix", async () => {
    const dir = await fs.promises.mkdtemp(join(tmpdir(), "vfs-prom-mkdtemp-"));
    try {
      expect(fs.statSync(dir).isDirectory()).toBe(true);
    } finally {
      try {
        fs.rmdirSync(dir);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.truncate falls through to real fs for non-VFS path", async () => {
    const tmp = join(tmpdir(), "vfs-prom-truncate-" + Date.now() + ".txt");
    fs.writeFileSync(tmp, "hello world");
    try {
      await fs.promises.truncate(tmp, 5);
      expect(fs.readFileSync(tmp, "utf8")).toBe("hello");
    } finally {
      try {
        fs.unlinkSync(tmp);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.link falls through to real fs for non-VFS paths", async () => {
    const src = join(tmpdir(), "vfs-prom-link-src-" + Date.now() + ".txt");
    const dest = join(tmpdir(), "vfs-prom-link-dst-" + Date.now() + ".txt");
    fs.writeFileSync(src, "link test");
    try {
      await fs.promises.link(src, dest);
      expect(fs.readFileSync(dest, "utf8")).toBe("link test");
    } finally {
      try {
        fs.unlinkSync(src);
      } catch {
        // ignore
      }
      try {
        fs.unlinkSync(dest);
      } catch {
        // ignore
      }
    }
  });

  it("fs.promises.realpath falls through to real fs for non-VFS path", async () => {
    const real = await fs.promises.realpath(process.cwd());
    expect(real).toBeTruthy();
  });

  it("fs.promises.readlink falls through to real fs (throws for non-symlink)", async () => {
    await expect(
      fs.promises.readlink(join(process.cwd(), "package.json")),
    ).rejects.toThrow();
  });

  it("fs.promises.access falls through to real fs for non-VFS path", async () => {
    await expect(
      fs.promises.access(join(process.cwd(), "package.json")),
    ).resolves.toBeUndefined();
  });
});

// ─── virtualCwd: process.cwd and process.chdir hooks ─────────────────────────

describe("virtualCwd process.cwd() and process.chdir() hooks", () => {
  const MOUNT = "/scratchyjs-vfs-pcwd-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create({ virtualCwd: true });
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("process.cwd() returns the real cwd when virtual cwd is not yet set", () => {
    // virtualCwd is null until chdir() is called, so process.cwd() falls through
    const result = process.cwd();
    // Should not return MOUNT since we haven't called chdir yet
    expect(result).not.toBe(MOUNT);
  });

  it("process.chdir() with a VFS path sets the virtual cwd", () => {
    vfs.addDirectory(MOUNT + "/pcd");
    process.chdir(MOUNT + "/pcd");
    expect(process.cwd()).toBe(MOUNT + "/pcd");
  });

  it("process.chdir() with a non-VFS path delegates to real chdir", () => {
    const realCwd = process.cwd();
    // Chdir to the same directory (no-op) to exercise the fallback
    // We only call this when it's outside the VFS mount
    const outsidePath = "/tmp";
    // Record vfs.cwd() before — should still be null (no vfs.chdir called)
    expect(vfs.cwd()).toBeNull();
    // Call process.chdir with a real path that's NOT under the VFS mount
    try {
      process.chdir(outsidePath);
      // If chdir succeeds, the real process cwd changed — change back
      process.chdir(realCwd);
    } catch {
      // If /tmp doesn't exist or permission denied, that's fine
    }
    // Virtual cwd should still be null
    expect(vfs.cwd()).toBeNull();
  });
});

// ─── MemoryProvider: #lookupEntry symlink traversal edge cases ───────────────

describe("MemoryProvider: #lookupEntry symlink traversal edge cases", () => {
  let provider: MemoryProvider;

  beforeEach(() => {
    provider = new MemoryProvider();
  });

  it("mid-path broken symlink (dangling) yields not-found without throwing", () => {
    // /a → /nonexistent (dangling symlink used as a path component)
    // Accessing /a/file.txt should hit lines 251-252 (broken mid-path symlink
    // result has entry: null) and return false rather than throw.
    provider.symlinkSync("/nonexistent", "/a");
    expect(provider.existsSync("/a/file.txt")).toBe(false);
    // statSync should throw ENOENT (not ELOOP)
    expect(() => provider.statSync("/a/file.txt")).toThrow(
      expect.objectContaining({ code: "ENOENT" }),
    );
  });

  it("mid-path symlink at MAX_SYMLINK_DEPTH triggers ELOOP (lines 244-245)", () => {
    // Build a chain: /s0 → /s1 → ... → /s38 → /s39 → /s0/x
    // Following /s0/x requires the resolver to enter #lookupEntry("/s0/x", …)
    // at depth=40.  At that depth the mid-path symlink guard (lines 244-245)
    // fires because "s0" resolves to symlink_s0 and depth >= MAX_SYMLINK_DEPTH.
    const CHAIN = 40; // MAX_SYMLINK_DEPTH
    for (let i = 0; i < CHAIN - 1; i++) {
      provider.symlinkSync(`/s${i + 1}`, `/s${i}`);
    }
    // The last link points back through a sub-path to close the loop
    provider.symlinkSync("/s0/x", `/s${CHAIN - 1}`);
    expect(() => provider.statSync("/s0/x")).toThrow(
      expect.objectContaining({ code: "ELOOP" }),
    );
  });

  it("#ensureParent resolves a symlink that is the final parent segment (lines 334-339)", () => {
    // /realdir is a real directory; /symdir → /realdir
    // Writing /symdir/file.txt exercises the post-loop symlink resolution in
    // #ensureParent (single parent segment is a symlink).
    provider.mkdirSync("/realdir");
    provider.symlinkSync("/realdir", "/symdir");
    provider.writeFileSync("/symdir/file.txt", "through symlink");
    // The file ends up in the real directory
    expect(
      provider.readFileSync("/realdir/file.txt", { encoding: "utf8" }),
    ).toBe("through symlink");
  });

  it("#ensureParent resolves a symlink mid-path (lines 307-313)", () => {
    // /realdir/subdir exists; /a → /realdir
    // Writing /a/subdir/file.txt exercises the in-loop symlink resolution in
    // #ensureParent (an intermediate parent segment is a symlink).
    provider.mkdirSync("/realdir/subdir", { recursive: true });
    provider.symlinkSync("/realdir", "/a");
    provider.writeFileSync("/a/subdir/file.txt", "nested symlink write");
    expect(
      provider.readFileSync("/realdir/subdir/file.txt", { encoding: "utf8" }),
    ).toBe("nested symlink write");
  });

  it("readdirSync with recursive + withFileTypes returns VfsDirent objects (lines 522-527)", () => {
    provider.mkdirSync("/rdir/sub", { recursive: true });
    provider.writeFileSync("/rdir/top.txt", "");
    provider.writeFileSync("/rdir/sub/deep.txt", "");
    // Add a symlink so the TYPE_SYMLINK branch (line 524) is reached
    provider.symlinkSync("/rdir/sub/deep.txt", "/rdir/sym-link.txt");
    const entries = provider.readdirSync("/rdir", {
      recursive: true,
      withFileTypes: true,
    });
    expect(Array.isArray(entries)).toBe(true);
    expect(entries.length).toBeGreaterThanOrEqual(3);
    // Every entry should be a VfsDirent (not a plain string)
    for (const e of entries) {
      expect(typeof (e as { name: string }).name).toBe("string");
    }
    // Verify symlink type is correctly represented
    const names = entries.map((e) => (e as { name: string }).name);
    expect(names.some((n) => n.includes("sym-link.txt"))).toBe(true);
  });
});

// ─── MemoryProvider: write/append encoding branches ──────────────────────────

describe("MemoryProvider: write/append encoding option branches", () => {
  let provider: MemoryProvider;

  beforeEach(() => {
    provider = new MemoryProvider();
  });

  it("writeFileSync with a string encoding option (line 582-583)", () => {
    // The ternary `typeof options === "string" ? options : …` is hit
    provider.writeFileSync("/enc-write.txt", "hello", "utf8");
    expect(provider.readFileSync("/enc-write.txt", { encoding: "utf8" })).toBe(
      "hello",
    );
  });

  it("writeFileSync overwrites an existing file (lines 598-601)", () => {
    provider.writeFileSync("/overwrite.txt", "first");
    provider.writeFileSync("/overwrite.txt", "second");
    expect(provider.readFileSync("/overwrite.txt", { encoding: "utf8" })).toBe(
      "second",
    );
  });

  it("appendFileSync with a string encoding option (line 632-633)", () => {
    provider.writeFileSync("/enc-app.txt", "hello");
    provider.appendFileSync("/enc-app.txt", " world", "utf8");
    expect(provider.readFileSync("/enc-app.txt", { encoding: "utf8" })).toBe(
      "hello world",
    );
  });

  it("appendFileSync with Buffer data (line 638-639)", () => {
    provider.writeFileSync("/buf-app.txt", "hello");
    provider.appendFileSync("/buf-app.txt", Buffer.from(" world"));
    expect(provider.readFileSync("/buf-app.txt", { encoding: "utf8" })).toBe(
      "hello world",
    );
  });

  it("#normalizePath prepends '/' when input lacks a leading slash (L206 true branch)", () => {
    // A relative path (no leading '/') triggers the
    // `if (!normalized.startsWith('/')) normalized = '/' + normalized` branch.
    provider.writeFileSync("no-slash.txt", "relative write");
    expect(provider.readFileSync("/no-slash.txt", { encoding: "utf8" })).toBe(
      "relative write",
    );
  });
});

// ─── VirtualFileSystem: resolvePath relative input + symlinkSync relative target

describe("VirtualFileSystem: resolvePath and symlinkSync edge cases", () => {
  const MOUNT = "/scratchyjs-vfs-edgecases-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("resolvePath() with a relative input falls through to path.resolve (line 289)", () => {
    // Input has no leading "/" and virtualCwd is not enabled →
    // the final `return resolve(inputPath)` branch (line 289) is taken.
    const result = vfs.resolvePath("relative/file.txt");
    expect(result).toBe(resolve("relative/file.txt"));
  });

  it("vfs.symlinkSync() stores a relative target as-is (line 425 else branch)", () => {
    // pathPosix.isAbsolute("target.txt") === false →
    // providerTarget = target (line 425), NOT translated through #toProviderPath.
    vfs.addDirectory(MOUNT + "/dir");
    vfs.addFile(MOUNT + "/dir/target.txt", "content");
    vfs.symlinkSync("target.txt", MOUNT + "/dir/rel-link");
    // The symlink exists and follows to the real file
    expect(vfs.lstatSync(MOUNT + "/dir/rel-link").isSymbolicLink()).toBe(true);
    expect(vfs.readFileSync(MOUNT + "/dir/rel-link", "utf8")).toBe("content");
  });
});

// ─── fs.promises hooks: mkdir fallback + symlink relative target + readlink ──

describe("fs.promises hooks: mkdir fallback, relative symlink target", () => {
  const MOUNT = "/scratchyjs-vfs-prom-hooks-" + process.pid;
  let vfs: ReturnType<typeof create>;

  beforeEach(() => {
    vfs = create();
    vfs.mount(MOUNT);
  });

  afterEach(() => {
    if (vfs?.mounted) vfs.unmount();
  });

  it("fs.promises.mkdir falls through to real fs when path is outside VFS (line 1005)", async () => {
    const tmpPath = join(tmpdir(), "vfs-prom-mkdir-fallback-" + Date.now());
    try {
      const result = await fs.promises.mkdir(tmpPath);
      expect(result).toBeUndefined();
      expect(fs.statSync(tmpPath).isDirectory()).toBe(true);
    } finally {
      try {
        fs.rmdirSync(tmpPath);
      } catch {
        // ignore cleanup errors
      }
    }
  });

  it("fs.promises.mkdir recursive returns the first-created mounted path (L1003 non-undefined branch)", async () => {
    // provider.mkdir with recursive:true returns the first new path;
    // the hook wraps it with #toMountedPath.  This covers the true arm of
    // `result !== undefined ? this.#toMountedPath(result) : undefined` (L1003[0]).
    const result = await fs.promises.mkdir(MOUNT + "/pm-r/x/y", {
      recursive: true,
    });
    expect(typeof result).toBe("string");
    expect(result).toContain(MOUNT + "/pm-r");
    expect(fs.statSync(MOUNT + "/pm-r/x/y").isDirectory()).toBe(true);
  });

  it("fs.promises.symlink with a non-VFS target stores it as-is (line 1057)", async () => {
    // `target` is "relative.txt" — not under MOUNT so #shouldHandle(target) = false
    // → the else branch (line 1057): internalTarget = target as-is
    await fs.promises.symlink("relative.txt", MOUNT + "/rel-prom-link.txt");
    expect(vfs.lstatSync(MOUNT + "/rel-prom-link.txt").isSymbolicLink()).toBe(
      true,
    );
  });

  it("fs.promises.readlink returns a relative target unchanged (line 1110)", async () => {
    // Store a relative target via symlinkSync so readlinkSync returns a
    // non-absolute string.  The hook checks pathPosix.isAbsolute(result):
    // false → line 1110 returns result unchanged instead of calling
    // #toMountedPath.
    vfs.symlinkSync("relative.txt", MOUNT + "/rel-readlink.txt");
    const target = await fs.promises.readlink(MOUNT + "/rel-readlink.txt");
    expect(target).toBe("relative.txt");
  });
});
