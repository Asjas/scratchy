/**
 * Integration tests for @scratchy/utils.
 *
 * Each test creates a real Fastify server, exercises a utility inside a route
 * handler, and verifies the behaviour via server.inject().
 */
import { getClientIPAddress } from "./ip-address.js";
import { getClientLocales } from "./locales.js";
import { isPrefetch } from "./prefetch.js";
import { redirectBack } from "./redirect-back.js";
import {
  html,
  javascript,
  notModified,
  stylesheet,
  txt,
  xml,
} from "./responses.js";
import { safeRedirect } from "./safe-redirect.js";
import {
  fetchDest,
  fetchMode,
  fetchSite,
  isUserInitiated,
} from "./sec-fetch.js";
import Fastify from "fastify";
import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function buildServer(): Promise<FastifyInstance> {
  const server = Fastify({ logger: false });

  // --- IP address ---
  server.get("/ip", (request, reply) => {
    const ip = getClientIPAddress(request);
    return reply.send({ ip });
  });

  // --- Locales ---
  server.get("/locales", (request, reply) => {
    const locales = getClientLocales(request);
    return reply.send({ locales });
  });

  // --- Prefetch detection ---
  server.get("/prefetch", (request, reply) => {
    if (isPrefetch(request)) {
      reply.header("Cache-Control", "private, max-age=5");
      return reply.send({ prefetch: true });
    }
    return reply.send({ prefetch: false });
  });

  // --- Safe redirect ---
  server.get("/redirect", (request, reply) => {
    const { to } = request.query as { to?: string };
    const location = safeRedirect(to, "/home");
    return reply.redirect(location);
  });

  // --- Redirect back ---
  server.post("/action", (request, reply) => {
    const location = redirectBack(request, { fallback: "/fallback" });
    return reply.redirect(location);
  });

  // --- Response helpers ---
  server.get("/res/not-modified", (_request, reply) => {
    const res = notModified();
    return reply.status(res.status).send();
  });

  server.get("/res/javascript", async (_request, reply) => {
    const res = javascript("console.log('hello')");
    const body = await res.text();
    const contentType =
      res.headers.get("Content-Type") ??
      "application/javascript; charset=utf-8";
    return reply
      .status(res.status)
      .header("Content-Type", contentType)
      .send(body);
  });

  server.get("/res/stylesheet", async (_request, reply) => {
    const res = stylesheet("body { margin: 0 }");
    const body = await res.text();
    const contentType =
      res.headers.get("Content-Type") ?? "text/css; charset=utf-8";
    return reply
      .status(res.status)
      .header("Content-Type", contentType)
      .send(body);
  });

  server.get("/res/html", async (_request, reply) => {
    const res = html("<h1>Hello</h1>");
    const body = await res.text();
    const contentType =
      res.headers.get("Content-Type") ?? "text/html; charset=utf-8";
    return reply
      .status(res.status)
      .header("Content-Type", contentType)
      .send(body);
  });

  server.get("/res/xml", async (_request, reply) => {
    const res = xml("<?xml version='1.0'?><root />");
    const body = await res.text();
    const contentType =
      res.headers.get("Content-Type") ?? "application/xml; charset=utf-8";
    return reply
      .status(res.status)
      .header("Content-Type", contentType)
      .send(body);
  });

  server.get("/res/txt", async (_request, reply) => {
    const res = txt("User-agent: *\nAllow: /");
    const body = await res.text();
    const contentType =
      res.headers.get("Content-Type") ?? "text/plain; charset=utf-8";
    return reply
      .status(res.status)
      .header("Content-Type", contentType)
      .send(body);
  });

  // --- Sec-Fetch headers ---
  server.get("/sec-fetch", (request, reply) => {
    return reply.send({
      dest: fetchDest(request),
      mode: fetchMode(request),
      site: fetchSite(request),
      userInitiated: isUserInitiated(request),
    });
  });

  await server.ready();
  return server;
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe("integration: getClientIPAddress", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns null when no IP headers are present", async () => {
    const res = await server.inject({ method: "GET", url: "/ip" });
    expect(res.statusCode).toBe(200);
    expect(res.json().ip).toBeNull();
  });

  it("reads the client IP from x-forwarded-for", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/ip",
      headers: { "x-forwarded-for": "203.0.113.7" },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().ip).toBe("203.0.113.7");
  });

  it("reads the client IP from cf-connecting-ip", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/ip",
      headers: { "cf-connecting-ip": "198.51.100.42" },
    });
    expect(res.json().ip).toBe("198.51.100.42");
  });
});

describe("integration: getClientLocales", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns undefined when accept-language is not set", async () => {
    const res = await server.inject({ method: "GET", url: "/locales" });
    // undefined is omitted from JSON serialisation, so the key is absent
    expect(res.json<{ locales?: string[] }>().locales).toBeUndefined();
  });

  it("returns the parsed locales sorted by quality", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/locales",
      headers: { "accept-language": "de;q=0.7, en-US;q=0.9, fr;q=0.8" },
    });
    const { locales } = res.json<{ locales: string[] }>();
    expect(locales).toBeDefined();
    expect(locales[0]).toBe("en-US");
    expect(locales[1]).toBe("fr");
    expect(locales[2]).toBe("de");
  });
});

describe("integration: isPrefetch", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("returns false for a normal request", async () => {
    const res = await server.inject({ method: "GET", url: "/prefetch" });
    expect(res.json().prefetch).toBe(false);
    expect(res.headers["cache-control"]).toBeUndefined();
  });

  it("returns true and sets Cache-Control for a prefetch request", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/prefetch",
      headers: { purpose: "prefetch" },
    });
    expect(res.json().prefetch).toBe(true);
    expect(res.headers["cache-control"]).toBe("private, max-age=5");
  });

  it("detects prefetch via Sec-Fetch-Purpose header", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/prefetch",
      headers: { "sec-fetch-purpose": "prefetch" },
    });
    expect(res.json().prefetch).toBe(true);
  });
});

describe("integration: safeRedirect", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("redirects to the safe path when valid", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/redirect?to=%2Fdashboard",
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/dashboard");
  });

  it("redirects to the fallback for an unsafe URL", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/redirect?to=https%3A%2F%2Fevil.com",
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/home");
  });

  it("redirects to the fallback when no 'to' param is given", async () => {
    const res = await server.inject({ method: "GET", url: "/redirect" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/home");
  });
});

describe("integration: redirectBack", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("redirects to the Referer when present", async () => {
    const res = await server.inject({
      method: "POST",
      url: "/action",
      headers: { referer: "https://example.com/page" },
    });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("https://example.com/page");
  });

  it("redirects to the fallback when Referer is absent", async () => {
    const res = await server.inject({ method: "POST", url: "/action" });
    expect(res.statusCode).toBe(302);
    expect(res.headers.location).toBe("/fallback");
  });
});

describe("integration: response helpers", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("notModified returns 304 with empty body", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/res/not-modified",
    });
    expect(res.statusCode).toBe(304);
  });

  it("javascript sets the correct Content-Type header", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/res/javascript",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/javascript");
    expect(res.body).toBe("console.log('hello')");
  });

  it("stylesheet sets the correct Content-Type header", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/res/stylesheet",
    });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/css");
  });

  it("html sets the correct Content-Type header", async () => {
    const res = await server.inject({ method: "GET", url: "/res/html" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/html");
    expect(res.body).toBe("<h1>Hello</h1>");
  });

  it("xml sets the correct Content-Type header", async () => {
    const res = await server.inject({ method: "GET", url: "/res/xml" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("application/xml");
  });

  it("txt sets the correct Content-Type header", async () => {
    const res = await server.inject({ method: "GET", url: "/res/txt" });
    expect(res.statusCode).toBe(200);
    expect(res.headers["content-type"]).toContain("text/plain");
    expect(res.body).toBe("User-agent: *\nAllow: /");
  });
});

describe("integration: Sec-Fetch header parsers", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("parses all Sec-Fetch headers from the request", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/sec-fetch",
      headers: {
        "sec-fetch-dest": "document",
        "sec-fetch-mode": "navigate",
        "sec-fetch-site": "none",
        "sec-fetch-user": "?1",
      },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      dest: string;
      mode: string;
      site: string;
      userInitiated: boolean;
    }>();
    expect(body.dest).toBe("document");
    expect(body.mode).toBe("navigate");
    expect(body.site).toBe("none");
    expect(body.userInitiated).toBe(true);
  });

  it("returns null values when Sec-Fetch headers are absent", async () => {
    const res = await server.inject({ method: "GET", url: "/sec-fetch" });
    expect(res.statusCode).toBe(200);
    const body = res.json<{
      dest: null;
      mode: null;
      site: null;
      userInitiated: boolean;
    }>();
    expect(body.dest).toBeNull();
    expect(body.mode).toBeNull();
    expect(body.site).toBeNull();
    expect(body.userInitiated).toBe(false);
  });

  it("fetch() requests have dest=empty and mode=cors", async () => {
    const res = await server.inject({
      method: "GET",
      url: "/sec-fetch",
      headers: {
        "sec-fetch-dest": "empty",
        "sec-fetch-mode": "cors",
        "sec-fetch-site": "same-origin",
      },
    });
    const body = res.json<{ dest: string; mode: string; site: string }>();
    expect(body.dest).toBe("empty");
    expect(body.mode).toBe("cors");
    expect(body.site).toBe("same-origin");
  });
});
