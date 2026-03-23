/**
 * Tests for `@scratchyjs/vfs`.
 *
 * Covers three layers:
 * 1. `MemoryProvider` – low-level in-memory FS operations.
 * 2. `VirtualFileSystem` – path routing and `addFile`/`addDirectory` helpers.
 * 3. `mount()` / `unmount()` – monkey-patching of `node:fs`.
 */
import { create } from "./index.js";
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
