import { runSsgPipeline } from "./ssg-pipeline.js";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { afterEach, describe, expect, it } from "vitest";

/** Unique temporary directory per test run to avoid collisions. */
function makeTmpDir(): string {
  return join(
    tmpdir(),
    `ssg-test-${Date.now()}-${Math.random().toString(36).slice(2)}`,
  );
}

describe("runSsgPipeline", () => {
  // Track directories created by tests so we can verify them.
  const dirsCreated: string[] = [];

  afterEach(() => {
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
});
