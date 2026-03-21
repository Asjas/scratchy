import { wrapInShell } from "./templates/shell.js";
import { describe, expect, it } from "vitest";

describe("wrapInShell", () => {
  it("should produce a valid HTML document with body content", () => {
    const html = wrapInShell("<h1>Hello</h1>");

    expect(html).toContain("<!DOCTYPE html>");
    expect(html).toContain('<html lang="en">');
    expect(html).toContain('<meta charset="utf-8">');
    expect(html).toContain(
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
    );
    expect(html).toContain("<h1>Hello</h1>");
    expect(html).toContain("</body>");
    expect(html).toContain("</html>");
  });

  it("should include head content when provided", () => {
    const html = wrapInShell("<p>Body</p>", "<title>My Page</title>");

    expect(html).toContain("<title>My Page</title>");
    expect(html).toContain("<p>Body</p>");
  });

  it("should use default lang='en' when no options are given", () => {
    const html = wrapInShell("<div></div>");
    expect(html).toContain('<html lang="en">');
  });

  it("should support a custom lang attribute", () => {
    const html = wrapInShell("<div></div>", "", { lang: "fr" });
    expect(html).toContain('<html lang="fr">');
  });

  it("should include extra html attributes when provided", () => {
    const html = wrapInShell("<div></div>", "", {
      htmlAttributes: 'class="dark"',
    });
    expect(html).toContain('<html lang="en" class="dark">');
  });

  it("should include extra body attributes when provided", () => {
    const html = wrapInShell("<div></div>", "", {
      bodyAttributes: 'class="bg-white"',
    });
    expect(html).toContain('<body class="bg-white">');
  });

  it("should default to empty head when not provided", () => {
    const html = wrapInShell("<div></div>");
    // Head section exists but with only the default meta tags
    expect(html).toContain("<head>");
    expect(html).toContain("</head>");
  });
});
