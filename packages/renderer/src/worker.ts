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
  headers?: Record<string, string>;
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
 * Inlined here so the worker has zero local-file imports, which
 * avoids .js/.ts extension mismatches when Piscina loads the file
 * with Node.js native type stripping.
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
async function renderSSR(
  route: string,
  props?: Record<string, unknown>,
): Promise<RenderResult> {
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
async function renderSSG(
  route: string,
  props?: Record<string, unknown>,
): Promise<RenderResult> {
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
export default async function handler(task: RenderTask): Promise<RenderResult> {
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
