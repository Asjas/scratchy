/**
 * Renderer worker entry point.
 *
 * This worker is loaded by Piscina in a Worker Thread and handles
 * SSR and SSG rendering tasks dispatched from the main thread via
 * `fastify.runTask()`.
 *
 * For production use, replace the placeholder logic here with your
 * Qwik SSR pipeline (e.g. `renderToString` from `@builder.io/qwik/server`).
 *
 * This file is intentionally free of local `~/` imports. Piscina
 * loads it directly with Node.js type stripping, which does not
 * resolve `~/` aliases. Package imports (e.g. `@scratchyjs/renderer/worker`)
 * are fine because Node.js resolves them through `node_modules`.
 */
export { default } from "@scratchyjs/renderer/worker";
