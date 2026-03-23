import { runSsgPipeline } from "./ssg-pipeline.js";
import { readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs/promises", async (importOriginal) => {
  const actual = await importOriginal<typeof import("node:fs/promises")>();
  return { ...actual, writeFile: vi.fn(actual.writeFile) };
});

/** Unique temporary directory per test run to avoid collisions. */
function makeTmpDir(): string {
  return join(
    tmpdir(),
    `ssg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

describe("runSsgPipeline", () => {
  // Track temporary directories created by each test for cleanup.
  const dirsCreated: string[] = [];

  afterEach(async () => {
    await Promise.all(
      dirsCreated.map((dir) => rm(dir, { recursive: true, force: true })),
    );
    dirsCreated.length = 0;
  });

  it("returns empty result when routes array is empty", async () => {
    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: [],
      outDir: makeTmpDir(),
    });

    expect(result.rendered).toHaveLength(0);
    expect(result.failed).toHaveLength(0);
    expect(result.duration).toBe(0);
  });

  it("renders a single route and writes it to disk", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/"],
      outDir,
      maxThreads: 1,
    });

    expect(result.rendered).toHaveLength(1);
    expect(result.failed).toHaveLength(0);
    expect(result.rendered[0]?.route).toBe("/");
    expect(result.rendered[0]?.path).toBe(join(outDir, "index.html"));

    const html = await readFile(join(outDir, "index.html"), "utf8");
    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('data-ssg="true"');
  });

  it("renders multiple routes and writes each as an index.html", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/", "/about", "/blog/hello"],
      outDir,
      maxThreads: 2,
    });

    expect(result.rendered).toHaveLength(3);
    expect(result.failed).toHaveLength(0);

    const routes = result.rendered.map((r) => r.route).sort();
    expect(routes).toEqual(["/", "/about", "/blog/hello"]);

    const rootHtml = await readFile(join(outDir, "index.html"), "utf8");
    expect(rootHtml).toContain('data-route="/"');

    const aboutHtml = await readFile(
      join(outDir, "about", "index.html"),
      "utf8",
    );
    expect(aboutHtml).toContain('data-route="/about"');

    const blogHtml = await readFile(
      join(outDir, "blog", "hello", "index.html"),
      "utf8",
    );
    expect(blogHtml).toContain('data-route="/blog/hello"');
  });

  it("passes props to the renderer via getProps", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/products"],
      outDir,
      maxThreads: 1,
      getProps: (route) => ({ page: route, count: 42 }),
    });

    expect(result.rendered).toHaveLength(1);

    const html = await readFile(join(outDir, "products", "index.html"), "utf8");
    // Props are HTML-escaped inside the script tag.
    expect(html).toContain("&quot;page&quot;");
    expect(html).toContain("&quot;count&quot;");
    expect(html).toContain("42");
  });

  it("records a failure when the worker throws", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    // Pass a non-existent worker path to force a failure.
    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "does-not-exist.ts"),
      routes: ["/error-route"],
      outDir,
      maxThreads: 1,
    });

    expect(result.rendered).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.route).toBe("/error-route");
    expect(result.failed[0]?.error).toBeInstanceOf(Error);
  });

  it("tracks wall-clock duration for a real render", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/timing"],
      outDir,
      maxThreads: 1,
    });

    expect(result.duration).toBeGreaterThan(0);
  });

  it("strips query strings and fragments from routes when building file paths", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/page?lang=en#section"],
      outDir,
      maxThreads: 1,
    });

    // The file should be written to /page/index.html, not /page?lang=en#section/index.html
    expect(result.rendered).toHaveLength(1);
    expect(result.rendered[0]?.path).toBe(join(outDir, "page", "index.html"));
  });

  it("resolves .. in routes safely via URL normalisation", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    // /a/../b normalises to /b — the rendered path must be inside outDir
    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/a/../b"],
      outDir,
      maxThreads: 1,
    });

    expect(result.rendered).toHaveLength(1);
    expect(result.rendered[0]?.path).toBe(join(outDir, "b", "index.html"));
  });

  it("records a failure when getProps throws", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/props-error"],
      outDir,
      maxThreads: 1,
      getProps: () => Promise.reject(new Error("props fetch failed")),
    });

    expect(result.rendered).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.route).toBe("/props-error");
    expect(result.failed[0]?.error.message).toBe("props fetch failed");
  });

  it("throws RangeError for invalid maxThreads", async () => {
    await expect(
      runSsgPipeline({
        worker: resolve(import.meta.dirname, "worker.ts"),
        routes: ["/"],
        outDir: makeTmpDir(),
        maxThreads: 0,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("throws RangeError for non-integer maxThreads", async () => {
    await expect(
      runSsgPipeline({
        worker: resolve(import.meta.dirname, "worker.ts"),
        routes: ["/"],
        outDir: makeTmpDir(),
        maxThreads: 1.5,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("throws RangeError for invalid taskTimeout", async () => {
    await expect(
      runSsgPipeline({
        worker: resolve(import.meta.dirname, "worker.ts"),
        routes: ["/"],
        outDir: makeTmpDir(),
        taskTimeout: -1,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("throws RangeError for non-integer taskTimeout", async () => {
    await expect(
      runSsgPipeline({
        worker: resolve(import.meta.dirname, "worker.ts"),
        routes: ["/"],
        outDir: makeTmpDir(),
        taskTimeout: 1.5,
      }),
    ).rejects.toThrow(RangeError);
  });

  it("records a failure when getProps throws a non-Error value", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/props-string-error"],
      outDir,
      maxThreads: 1,
      getProps: () => {
        throw "string error from getProps";
      },
    });

    expect(result.rendered).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.route).toBe("/props-string-error");
    expect(result.failed[0]?.error.message).toBe("string error from getProps");
  });

  it("records failure and writes error for write-permission-denied path", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    // Stub writeFile to reject with EACCES so the write-failure branch is
    // exercised deterministically without relying on OS-level permissions.
    const eaccesError = Object.assign(
      new Error("EACCES: permission denied, open '/write-fail/index.html'"),
      { code: "EACCES" as const },
    );
    vi.mocked(writeFile).mockRejectedValueOnce(eaccesError);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "worker.ts"),
      routes: ["/write-fail"],
      outDir,
      maxThreads: 1,
    });

    expect(result.rendered).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.route).toBe("/write-fail");
    expect(result.failed[0]?.error).toBeInstanceOf(Error);
  });

  it("records a failure with wrapped message when worker throws a non-Error", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(
        import.meta.dirname,
        "test-workers",
        "throw-string-worker.ts",
      ),
      routes: ["/non-error-throw"],
      outDir,
      maxThreads: 1,
    });

    expect(result.rendered).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.route).toBe("/non-error-throw");
    expect(result.failed[0]?.error).toBeInstanceOf(Error);
    expect(result.failed[0]?.error.message).toContain(
      "string error from worker",
    );
  });

  it("records a failure with timeout message when worker times out", async () => {
    const outDir = makeTmpDir();
    dirsCreated.push(outDir);

    const result = await runSsgPipeline({
      worker: resolve(import.meta.dirname, "test-workers", "hang-worker.ts"),
      routes: ["/timeout-route"],
      outDir,
      maxThreads: 1,
      taskTimeout: 200, // 200ms timeout for fast test
    });

    expect(result.rendered).toHaveLength(0);
    expect(result.failed).toHaveLength(1);
    expect(result.failed[0]?.route).toBe("/timeout-route");
    expect(result.failed[0]?.error).toBeInstanceOf(Error);
    expect(result.failed[0]?.error.message).toContain("timed out");
  }, 10_000);
});
