import handler from "./worker.js";
import { describe, expect, it } from "vitest";

describe("worker handler", () => {
  it("should render an SSR task and return valid HTML", async () => {
    const result = await handler({
      type: "ssr",
      route: "/about",
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain('data-route="/about"');
    expect(result.head).toBe("<title>SSR</title>");
  });

  it("should render an SSG task and return valid HTML", async () => {
    const result = await handler({
      type: "ssg",
      route: "/blog/hello",
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain('data-route="/blog/hello"');
    expect(result.html).toContain('data-ssg="true"');
    expect(result.head).toBe("<title>SSG</title>");
  });

  it("should include props in the rendered body for SSR", async () => {
    const result = await handler({
      type: "ssr",
      route: "/profile",
      props: { userId: "u1", name: "Alice" },
    });

    expect(result.html).toContain('"userId":"u1"');
    expect(result.html).toContain('"name":"Alice"');
  });

  it("should include props in the rendered body for SSG", async () => {
    const result = await handler({
      type: "ssg",
      route: "/posts/42",
      props: { title: "Hello World" },
    });

    expect(result.html).toContain('"title":"Hello World"');
  });

  it("should render empty body when no props are given", async () => {
    const result = await handler({
      type: "ssr",
      route: "/empty",
    });

    expect(result.html).toContain('data-route="/empty"');
    expect(result.html).toContain("></div>");
  });

  it("should throw for unknown task type", async () => {
    await expect(
      handler({ type: "unknown" as "ssr", route: "/" }),
    ).rejects.toThrow(/Unknown render task type/);
  });
});
