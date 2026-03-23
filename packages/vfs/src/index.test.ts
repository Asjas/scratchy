/**
 * Tests for `@scratchyjs/vfs`.
 *
 * Covers three layers:
 * 1. `MemoryProvider` – low-level in-memory FS operations.
 * 2. `VirtualFileSystem` – path routing and `addFile`/`addDirectory` helpers.
 * 3. `mount()` / `unmount()` – monkey-patching of `node:fs`.
 */
import { create } from "./index.js";
import type { VfsDirent } from "./index.js";
import { MemoryProvider } from "./memory-provider.js";
import fs from "node:fs";
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
