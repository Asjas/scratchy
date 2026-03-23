/**
 * Renderer worker entry point for the streaming-ssr example.
 *
 * This worker is loaded by Piscina in a Worker Thread and handles
 * SSR and streaming SSR rendering tasks dispatched from the main thread
 * via `fastify.runTask()`.
 *
 * For production use, replace the placeholder logic here with your
 * Qwik SSR pipeline (e.g. `renderToStream` from `@builder.io/qwik/server`).
 *
 * This file is intentionally free of local `.ts` imports. Piscina
 * loads it directly with Node.js type stripping, which does not
 * resolve `.js` extensions to `.ts` files for local modules.
 * Package imports (e.g. `@scratchyjs/renderer/worker`) are fine because
 * Node.js resolves them through `node_modules` independently of the
 * file extension.
 */
export { default } from "@scratchyjs/renderer/worker";
