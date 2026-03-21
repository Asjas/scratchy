/**
 * Describes a rendering task dispatched to the worker pool.
 */
export interface RenderTask {
  /** Rendering mode: server-side or static generation. */
  type: "ssr" | "ssg";
  /** The route path to render (e.g. `"/about"`). */
  route: string;
  /** Optional props / data to pass into the renderer. */
  props?: Record<string, unknown>;
  /** Optional request headers forwarded from the client. */
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
 * Qwik SSR pipeline would be invoked here.
 */
function renderSSR(
  route: string,
  props?: Record<string, unknown>,
): RenderResult {
  const head = "<title>SSR</title>";
  const body = `<div id="app" data-route="${route}">${props ? JSON.stringify(props) : ""}</div>`;

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
 * Qwik SSG pipeline would be invoked here.
 */
function renderSSG(
  route: string,
  props?: Record<string, unknown>,
): RenderResult {
  const head = "<title>SSG</title>";
  const body = `<div id="app" data-route="${route}" data-ssg="true">${props ? JSON.stringify(props) : ""}</div>`;

  return {
    html: shell(body, head),
    head,
    statusCode: 200,
  };
}

/**
 * Worker entry point. Piscina calls this function for each task
 * dispatched via `fastify.runTask()`.
 */
export default function handler(task: RenderTask): RenderResult {
  switch (task.type) {
    case "ssr":
      return renderSSR(task.route, task.props);
    case "ssg":
      return renderSSG(task.route, task.props);
    default:
      throw new Error(
        `Unknown render task type: ${String((task as RenderTask).type)}`,
      );
  }
}
