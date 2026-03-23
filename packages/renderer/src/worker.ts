/**
 * Describes a rendering task dispatched to the worker pool.
 */
export interface RenderTask {
  /** Rendering mode: server-side or static generation. */
  type: "ssr" | "ssg" | "ssr-stream";
  /** The route path to render (e.g. `"/about"`). */
  route: string;
  /** Optional props / data to pass into the renderer. */
  props?: Record<string, unknown>;
  /** Optional request headers forwarded from the client. */
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * A render task for non-streaming modes (SSR or SSG).
 */
export interface NonStreamingRenderTask {
  type: "ssr" | "ssg";
  route: string;
  props?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * A render task for streaming SSR mode.
 */
export interface StreamingRenderTask {
  type: "ssr-stream";
  route: string;
  props?: Record<string, unknown>;
  headers?: Record<string, string | string[] | undefined>;
}

/**
 * The result returned from a render task.
 */
export interface RenderResult {
  /** The fully rendered HTML document. */
  html: string;
  /** Content to inject into `<head>` (meta tags, styles, etc.). */
  head: string;
  /** HTTP status code for the response. */
  statusCode: number;
  /** Optional response headers to set on the HTTP reply. */
  headers?: Record<string, string>;
}

/**
 * The result returned from a streaming render task.
 * Contains an ordered array of HTML chunks to be sent progressively.
 */
export interface StreamingRenderResult {
  /**
   * Ordered HTML chunks to stream to the client.
   *
   * Typical layout:
   * - `chunks[0]`: HTML shell + `<head>` section (sent immediately so the
   *   browser can start parsing critical CSS/JS links).
   * - `chunks[1]`: Above-the-fold body content.
   * - `chunks[2]` … `chunks[n-2]`: Deferred / below-fold content sections.
   * - Last chunk: Closing `</body></html>` tag.
   */
  chunks: string[];
  /** HTTP status code for the response. */
  statusCode: number;
  /** Optional response headers to set on the HTTP reply. */
  headers?: Record<string, string>;
}

/**
 * Escapes HTML-special characters to prevent XSS when interpolating
 * untrusted values into HTML attributes or text content.
 *
 * Inlined here because Piscina workers cannot import local `.ts`
 * files (Node.js type stripping does not resolve `.js` → `.ts`).
 */
function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

/**
 * Wraps body and head content in the HTML shell.
 *
 * This is intentionally inlined rather than imported from
 * `templates/shell.ts`. Piscina workers are loaded by Node.js
 * directly (outside Vitest), and Node.js type stripping does not
 * resolve `.js` extensions to `.ts` files. Keeping the worker
 * free of local-file imports avoids this resolution mismatch.
 *
 * The canonical, feature-complete template lives in
 * `templates/shell.ts` — keep both in sync when modifying the
 * HTML structure.
 */
function shell(body: string, head: string): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
${body}
</body>
</html>`;
}

/**
 * Server-side renders the given route.
 *
 * This is a placeholder implementation. In a real application the
 * Qwik SSR pipeline would be invoked here. Route and props are
 * HTML-escaped to prevent XSS; props are embedded in a non-executable
 * `<script type="application/json">` block for safe transport.
 */
function renderSSR(
  route: string,
  props?: Record<string, unknown>,
): RenderResult {
  const head = "<title>SSR</title>";
  const escapedRoute = escapeHtml(route);
  const propsScript = props
    ? `<script type="application/json" id="__PROPS__">${escapeHtml(JSON.stringify(props))}</script>`
    : "";
  const body = `<div id="app" data-route="${escapedRoute}"></div>${propsScript}`;

  return {
    html: shell(body, head),
    head,
    statusCode: 200,
  };
}

/**
 * Statically generates HTML for the given route.
 *
 * This is a placeholder implementation. In a real application the
 * Qwik SSG pipeline would be invoked here. Route and props are
 * HTML-escaped to prevent XSS; props are embedded in a non-executable
 * `<script type="application/json">` block for safe transport.
 */
function renderSSG(
  route: string,
  props?: Record<string, unknown>,
): RenderResult {
  const head = "<title>SSG</title>";
  const escapedRoute = escapeHtml(route);
  const propsScript = props
    ? `<script type="application/json" id="__PROPS__">${escapeHtml(JSON.stringify(props))}</script>`
    : "";
  const body = `<div id="app" data-route="${escapedRoute}" data-ssg="true"></div>${propsScript}`;

  return {
    html: shell(body, head),
    head,
    statusCode: 200,
  };
}

/**
 * Renders the given route in streaming mode, splitting the HTML into
 * ordered chunks so the main thread can pipe them to the response with
 * `Transfer-Encoding: chunked`.
 *
 * Chunk layout:
 * 1. HTML shell + `<head>` section — sent immediately so the browser
 *    can start fetching critical resources before the body is ready.
 * 2. Above-the-fold body content (the `#app` mount point + props).
 * 3. Closing `</body></html>` — ends the response.
 *
 * This is a placeholder implementation. In a real Qwik application the
 * render pipeline would yield chunks as components resolve (e.g. using
 * `renderToStream()` from `@builder.io/qwik/server`). Route and props
 * are HTML-escaped to prevent XSS.
 */
function renderStreamingSSR(
  route: string,
  props?: Record<string, unknown>,
): StreamingRenderResult {
  const head = "<title>SSR</title>";
  const escapedRoute = escapeHtml(route);
  const propsScript = props
    ? `<script type="application/json" id="__PROPS__">${escapeHtml(JSON.stringify(props))}</script>`
    : "";

  // Chunk 1: HTML shell opening + full <head> (critical path — sent first).
  const shellChunk = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${head}
</head>
<body>
`;

  // Chunk 2: Above-the-fold app content.
  const contentChunk = `<div id="app" data-route="${escapedRoute}" data-streaming="true">${propsScript}</div>
`;

  // Chunk 3: Closing tags.
  const closingChunk = `</body>
</html>`;

  return {
    chunks: [shellChunk, contentChunk, closingChunk],
    statusCode: 200,
  };
}

/**
 * Worker entry point. Piscina calls this function for each task
 * dispatched via `fastify.runTask()`.
 *
 * Overloads ensure the correct return type is inferred at call sites:
 * - `"ssr"` / `"ssg"` tasks → `RenderResult`
 * - `"ssr-stream"` tasks → `StreamingRenderResult`
 */
export default function handler(task: NonStreamingRenderTask): RenderResult;
export default function handler(
  task: StreamingRenderTask,
): StreamingRenderResult;
export default function handler(
  task: RenderTask,
): RenderResult | StreamingRenderResult {
  switch (task.type) {
    case "ssr":
      return renderSSR(task.route, task.props);
    case "ssg":
      return renderSSG(task.route, task.props);
    case "ssr-stream":
      return renderStreamingSSR(task.route, task.props);
    default:
      throw new Error(
        `Unknown render task type: ${String((task as RenderTask).type)}`,
      );
  }
}
