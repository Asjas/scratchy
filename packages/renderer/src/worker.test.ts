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

  it("should render an ssr-stream task and return multiple chunks", () => {
    const result = handler({
      type: "ssr-stream",
      route: "/dashboard",
    });

    expect("chunks" in result).toBe(true);
    if (!("chunks" in result)) return;

    expect(result.statusCode).toBe(200);
    expect(Array.isArray(result.chunks)).toBe(true);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);

    const combined = result.chunks.join("");
    expect(combined).toContain("<!DOCTYPE html>");
    expect(combined).toContain('data-route="/dashboard"');
    expect(combined).toContain('data-streaming="true"');
    expect(combined).toContain("</body>");
    expect(combined).toContain("</html>");
  });

  it("should place the HTML shell in the first chunk for ssr-stream", () => {
    const result = handler({
      type: "ssr-stream",
      route: "/home",
    });

    if (!("chunks" in result)) return;

    // The first chunk must contain the HTML shell so the browser can start
    // fetching critical resources before the body content arrives.
    expect(result.chunks[0]).toContain("<!DOCTYPE html>");
    expect(result.chunks[0]).toContain("<head>");
    expect(result.chunks[0]).toContain("<body>");
  });

  it("should place closing tags in the last chunk for ssr-stream", () => {
    const result = handler({
      type: "ssr-stream",
      route: "/home",
    });

    if (!("chunks" in result)) return;

    const lastChunk = result.chunks[result.chunks.length - 1];
    expect(lastChunk).toContain("</body>");
    expect(lastChunk).toContain("</html>");
  });

  it("should include props in ssr-stream output adjacent to the app div", () => {
    const result = handler({
      type: "ssr-stream",
      route: "/profile",
      props: { userId: "u1", name: "Alice" },
    });

    if (!("chunks" in result)) return;

    const combined = result.chunks.join("");
    expect(combined).toContain(
      '<script type="application/json" id="__PROPS__">',
    );
    expect(combined).toContain("&quot;userId&quot;:&quot;u1&quot;");
    expect(combined).toContain("&quot;name&quot;:&quot;Alice&quot;");
    // Props script must appear after the closing </div>, not inside #app,
    // so the mount element stays clean for client-side resumability.
    const appDivEnd = combined.indexOf("</div>");
    const propsScriptStart = combined.indexOf(
      '<script type="application/json"',
    );
    expect(propsScriptStart).toBeGreaterThan(appDivEnd);
  });

  it("should HTML-escape route values in ssr-stream to prevent XSS", () => {
    const result = handler({
      type: "ssr-stream",
      route: '"><script>alert(1)</script>',
    });

    if (!("chunks" in result)) return;

    const combined = result.chunks.join("");
    expect(combined).not.toContain("<script>alert(1)</script>");
    expect(combined).toContain(
      "&quot;&gt;&lt;script&gt;alert(1)&lt;/script&gt;",
    );
  });

  it("should HTML-escape props values in ssr-stream to prevent XSS", () => {
    const result = handler({
      type: "ssr-stream",
      route: "/safe",
      props: { xss: '</script><script>alert("xss")</script>' },
    });

    if (!("chunks" in result)) return;

    const combined = result.chunks.join("");
    expect(combined).not.toContain('</script><script>alert("xss")</script>');
    expect(combined).toContain("&lt;/script&gt;&lt;script&gt;");
  });
});
