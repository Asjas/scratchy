import type { AppConfig } from "./config.js";
import { loadAppConfig } from "./config.js";
import { createServer } from "@scratchyjs/core";
import { createStreamingSSRHandler } from "@scratchyjs/renderer";
import { resolve } from "node:path";

export interface ServerOpts {
  /** Pre-loaded application config. Falls back to `loadAppConfig()` if omitted. */
  config?: AppConfig;
}

/**
 * Mock blog posts used as server-side props for the `/blog` route.
 * In a real application these would come from a database query.
 */
const BLOG_POSTS = [
  {
    id: "streaming-ssr-deep-dive",
    title: "A Deep Dive into Streaming SSR",
    excerpt:
      "Learn how chunked transfer encoding lets the browser paint above-the-fold content before the full response arrives.",
    publishedAt: "2025-01-15",
    author: "A-J Roos",
  },
  {
    id: "worker-threads-piscina",
    title: "Worker Threads with Piscina",
    excerpt:
      "Offload CPU-intensive SSR work from the main event loop with a Piscina worker pool and avoid request queuing.",
    publishedAt: "2025-02-03",
    author: "A-J Roos",
  },
  {
    id: "qwik-resumability",
    title: "Qwik Resumability vs Hydration",
    excerpt:
      "Why resumability ships zero JavaScript until the user interacts, and how it pairs perfectly with streaming SSR.",
    publishedAt: "2025-02-20",
    author: "A-J Roos",
  },
  {
    id: "fastify-performance",
    title: "Fastify Performance Tips",
    excerpt:
      "Schema validation, response serialisation, and route hook patterns that keep your Fastify server at peak throughput.",
    publishedAt: "2025-03-01",
    author: "A-J Roos",
  },
] as const;

/**
 * Creates and configures the Fastify server with streaming SSR wired up:
 * - `@scratchyjs/core` — base server (CORS, helmet, rate-limit, health route)
 * - `@scratchyjs/renderer` — Piscina SSR worker pool
 *
 * Every page route uses `createStreamingSSRHandler()` so HTML is streamed
 * to the client in ordered chunks via HTTP chunked transfer encoding. The
 * browser can begin parsing critical CSS / JS links from the `<head>` chunk
 * before the full body is ready.
 */
export async function buildServer(opts: ServerOpts = {}) {
  const config = opts.config ?? loadAppConfig();
  const server = await createServer(config);

  // ── Renderer worker pool ─────────────────────────────────────────────────
  const { default: rendererPlugin } =
    await import("@scratchyjs/renderer/plugin");
  const workerPath = resolve(import.meta.dirname, "renderer", "worker.ts");
  await server.register(rendererPlugin, {
    worker: workerPath,
    minThreads: 1,
    maxThreads: 2,
    taskTimeout: 10_000,
  });

  // ── Page routes (all use streaming SSR) ──────────────────────────────────
  //
  // Each route passes page-specific props to the worker so the renderer can
  // embed structured data in the HTML response. In a real Qwik application
  // the worker would call `renderToStream()` and the props would be consumed
  // by `routeLoader$()` hooks inside the components.

  // Home — feature highlights and a hero section.
  server.get(
    "/",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "home",
        headline: "Ship faster with Scratchy",
        subline:
          "A server-first TypeScript framework combining Fastify, Qwik, and streaming SSR.",
      }),
    }),
  );

  // About — team and mission.
  server.get(
    "/about",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "about",
        mission:
          "Make server-rendered web applications as fast and ergonomic as possible.",
        team: [
          { name: "A-J Roos", role: "Creator & Maintainer" },
          { name: "Community", role: "Contributors" },
        ],
      }),
    }),
  );

  // Features — detailed feature cards.
  server.get(
    "/features",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "features",
        features: [
          {
            title: "Streaming SSR",
            description:
              "Stream HTML chunks to the browser with chunked transfer encoding so the page paints progressively.",
          },
          {
            title: "Worker Threads",
            description:
              "All rendering runs in Piscina Worker Threads, keeping the main event loop free for API requests.",
          },
          {
            title: "Qwik Resumability",
            description:
              "Zero hydration overhead — Qwik resumes execution from serialised state without re-running components.",
          },
          {
            title: "Fastify 5",
            description:
              "Industry-leading JSON throughput, schema validation with Zod, and a plugin-based architecture.",
          },
          {
            title: "Type-safe End-to-End",
            description:
              "TypeScript strict mode from database schema to client components with no `any` types.",
          },
          {
            title: "Tailwind CSS",
            description:
              "Utility-first styling with Tailwind CSS, co-located with your Qwik components.",
          },
        ],
      }),
    }),
  );

  // Blog — list of articles with server-provided data.
  server.get(
    "/blog",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "blog",
        posts: BLOG_POSTS,
      }),
    }),
  );

  // Contact — contact form page.
  server.get(
    "/contact",
    createStreamingSSRHandler({
      getProps: () => ({
        page: "contact",
        email: "hello@scratchyjs.com",
        github: "https://github.com/Asjas/scratchyjs",
      }),
    }),
  );

  // Catch-all — any route not explicitly listed above (e.g. assets or
  // deeply-nested pages not yet added) also gets streaming SSR.
  server.get("/*", createStreamingSSRHandler());

  return server;
}
