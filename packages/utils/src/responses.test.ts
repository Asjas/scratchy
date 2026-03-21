import {
  html,
  image,
  javascript,
  notModified,
  pdf,
  stylesheet,
  txt,
  xml,
} from "./responses.js";
import { describe, expect, it } from "vitest";

describe("notModified", () => {
  it("returns a 304 response with a null body", async () => {
    const res = notModified();
    expect(res.status).toBe(304);
    expect(await res.text()).toBe("");
  });

  it("accepts additional init options", async () => {
    const res = notModified({ headers: { "x-custom": "value" } });
    expect(res.status).toBe(304);
    expect(res.headers.get("x-custom")).toBe("value");
  });
});

describe("javascript", () => {
  it("sets Content-Type to application/javascript", async () => {
    const res = javascript("console.log('hi')");
    expect(res.headers.get("Content-Type")).toBe(
      "application/javascript; charset=utf-8",
    );
    expect(await res.text()).toBe("console.log('hi')");
  });

  it("accepts a numeric status code", () => {
    const res = javascript("", 201);
    expect(res.status).toBe(201);
  });

  it("does not override an already-set Content-Type", () => {
    const res = javascript("code", {
      headers: { "Content-Type": "text/plain" },
    });
    expect(res.headers.get("Content-Type")).toBe("text/plain");
  });
});

describe("stylesheet", () => {
  it("sets Content-Type to text/css", async () => {
    const res = stylesheet("body { margin: 0 }");
    expect(res.headers.get("Content-Type")).toBe("text/css; charset=utf-8");
    expect(await res.text()).toBe("body { margin: 0 }");
  });

  it("accepts a numeric status code", () => {
    const res = stylesheet("", 201);
    expect(res.status).toBe(201);
  });
});

describe("pdf", () => {
  it("sets Content-Type to application/pdf", async () => {
    const res = pdf("pdf-bytes");
    expect(res.headers.get("Content-Type")).toBe("application/pdf");
    expect(await res.text()).toBe("pdf-bytes");
  });
});

describe("html", () => {
  it("sets Content-Type to text/html", async () => {
    const res = html("<h1>Hello</h1>");
    expect(res.headers.get("Content-Type")).toBe("text/html; charset=utf-8");
    expect(await res.text()).toBe("<h1>Hello</h1>");
  });

  it("accepts a numeric status code", () => {
    const res = html("<p>Not Found</p>", 404);
    expect(res.status).toBe(404);
  });
});

describe("xml", () => {
  it("sets Content-Type to application/xml", async () => {
    const content = "<?xml version='1.0'?><root />";
    const res = xml(content);
    expect(res.headers.get("Content-Type")).toBe(
      "application/xml; charset=utf-8",
    );
    expect(await res.text()).toBe(content);
  });
});

describe("txt", () => {
  it("sets Content-Type to text/plain", async () => {
    const res = txt("User-agent: *\nAllow: /");
    expect(res.headers.get("Content-Type")).toBe("text/plain; charset=utf-8");
    expect(await res.text()).toBe("User-agent: *\nAllow: /");
  });
});

describe("image", () => {
  it("sets the provided image MIME type as Content-Type", async () => {
    const bytes = Buffer.from("fake-image-data");
    const res = image(bytes, { type: "image/webp" });
    expect(res.headers.get("Content-Type")).toBe("image/webp");
  });

  it("does not override an already-set Content-Type", () => {
    const res = image(null, {
      type: "image/png",
      headers: { "Content-Type": "image/jpeg" },
    });
    expect(res.headers.get("Content-Type")).toBe("image/jpeg");
  });

  it("supports all image types", () => {
    const types = [
      "image/jpeg",
      "image/png",
      "image/gif",
      "image/svg+xml",
      "image/webp",
      "image/bmp",
      "image/avif",
    ] as const;

    for (const type of types) {
      const res = image(null, { type });
      expect(res.headers.get("Content-Type")).toBe(type);
    }
  });
});
