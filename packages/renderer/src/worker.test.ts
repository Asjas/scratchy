import handler from "./worker.js";
import { describe, expect, it } from "vitest";

describe("worker handler", () => {
  it("should render an SSR task and return valid HTML", () => {
    const result = handler({
      type: "ssr",
      route: "/about",
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain('data-route="/about"');
    expect(result.head).toBe("<title>SSR</title>");
  });

  it("should render an SSG task and return valid HTML", () => {
    const result = handler({
      type: "ssg",
      route: "/blog/hello",
    });

    expect(result.statusCode).toBe(200);
    expect(result.html).toContain("<!DOCTYPE html>");
    expect(result.html).toContain('data-route="/blog/hello"');
    expect(result.html).toContain('data-ssg="true"');
    expect(result.head).toBe("<title>SSG</title>");
  });

  it("should include props in a script tag for SSR", () => {
    const result = handler({
      type: "ssr",
      route: "/profile",
      props: { userId: "u1", name: "Alice" },
    });

    expect(result.html).toContain(
      '<script type="application/json" id="__PROPS__">',
    );
    expect(result.html).toContain("&quot;userId&quot;:&quot;u1&quot;");
    expect(result.html).toContain("&quot;name&quot;:&quot;Alice&quot;");
  });

  it("should include props in a script tag for SSG", () => {
    const result = handler({
      type: "ssg",
      route: "/posts/42",
      props: { title: "Hello World" },
    });

    expect(result.html).toContain(
      '<script type="application/json" id="__PROPS__">',
    );
    expect(result.html).toContain("&quot;title&quot;:&quot;Hello World&quot;");
  });

  it("should render empty body when no props are given", () => {
    const result = handler({
      type: "ssr",
      route: "/empty",
    });

    expect(result.html).toContain('data-route="/empty"');
    expect(result.html).not.toContain("__PROPS__");
  });

  it("should throw for unknown task type", () => {
    expect(() => handler({ type: "unknown" as "ssr", route: "/" })).toThrow(
      /Unknown render task type/,
    );
  });

  it("should HTML-escape route values to prevent XSS", () => {
    const result = handler({
      type: "ssr",
      route: '"><script>alert(1)</script>',
    });

    expect(result.html).not.toContain("<script>alert(1)</script>");
    expect(result.html).toContain(
      "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("should HTML-escape props values to prevent XSS", () => {
    const result = handler({
      type: "ssr",
      route: "/safe",
      props: { xss: '</script><script>alert("xss")</script>' },
    });

    expect(result.html).not.toContain('</script><script>alert("xss")</script>');
    expect(result.html).toContain("&lt;/script&gt;&lt;script&gt;");
  });
});
