/**
 * Create a `304 Not Modified` response with no body.
 *
 * @example
 * fastify.get("/resource", (request, reply) => {
 *   if (isNotModified(request)) return reply.send(notModified());
 * });
 */
export function notModified(init?: Omit<ResponseInit, "status">): Response {
  return new Response(null, { ...init, status: 304 });
}

/**
 * Create a response whose `Content-Type` is `application/javascript; charset=utf-8`.
 *
 * @example
 * fastify.get("/script.js", (request, reply) => {
 *   return javascript("console.log('hello')");
 * });
 */
export function javascript(
  content: string,
  init: number | ResponseInit = {},
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/javascript; charset=utf-8");
  }
  return new Response(content, { ...responseInit, headers });
}

/**
 * Create a response whose `Content-Type` is `text/css; charset=utf-8`.
 *
 * @example
 * fastify.get("/style.css", (request, reply) => {
 *   return stylesheet("body { margin: 0 }");
 * });
 */
export function stylesheet(
  content: string,
  init: number | ResponseInit = {},
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "text/css; charset=utf-8");
  }
  return new Response(content, { ...responseInit, headers });
}

/**
 * Create a response whose `Content-Type` is `application/pdf`.
 *
 * @example
 * fastify.get("/doc.pdf", async (request, reply) => {
 *   const content = await generatePDF();
 *   return pdf(content);
 * });
 */
export function pdf(
  content: BodyInit | null | undefined,
  init: number | ResponseInit = {},
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/pdf");
  }
  return new Response(content, { ...responseInit, headers });
}

/**
 * Create a response whose `Content-Type` is `text/html; charset=utf-8`.
 *
 * @example
 * fastify.get("/page", (request, reply) => {
 *   return html("<h1>Hello</h1>");
 * });
 */
export function html(
  content: string,
  init: number | ResponseInit = {},
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "text/html; charset=utf-8");
  }
  return new Response(content, { ...responseInit, headers });
}

/**
 * Create a response whose `Content-Type` is `application/xml; charset=utf-8`.
 *
 * @example
 * fastify.get("/feed.xml", (request, reply) => {
 *   return xml("<?xml version='1.0'?><feed></feed>");
 * });
 */
export function xml(
  content: string,
  init: number | ResponseInit = {},
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "application/xml; charset=utf-8");
  }
  return new Response(content, { ...responseInit, headers });
}

/**
 * Create a response whose `Content-Type` is `text/plain; charset=utf-8`.
 *
 * @example
 * fastify.get("/robots.txt", (request, reply) => {
 *   return txt("User-agent: *\nAllow: /");
 * });
 */
export function txt(
  content: string,
  init: number | ResponseInit = {},
): Response {
  const responseInit = typeof init === "number" ? { status: init } : init;
  const headers = new Headers(responseInit.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", "text/plain; charset=utf-8");
  }
  return new Response(content, { ...responseInit, headers });
}

/**
 * Supported image MIME types for the `image()` response helper.
 */
export type ImageType =
  | "image/jpeg"
  | "image/png"
  | "image/gif"
  | "image/svg+xml"
  | "image/webp"
  | "image/bmp"
  | "image/avif";

/**
 * Create a response for a binary image with the given MIME type.
 *
 * @param content - Image content as a `Buffer`, `ArrayBuffer`, or
 *   `ReadableStream`.
 * @param options.type - The image MIME type.
 *
 * @example
 * fastify.get("/avatar.webp", async (request, reply) => {
 *   return image(await generateAvatar(), { type: "image/webp" });
 * });
 */
export function image(
  content: BodyInit | null | undefined,
  { type, ...init }: ResponseInit & { type: ImageType },
): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("Content-Type")) {
    headers.set("Content-Type", type);
  }
  return new Response(content, { ...init, headers });
}
