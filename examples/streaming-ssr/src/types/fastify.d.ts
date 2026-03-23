/**
 * Fastify module augmentation — no additional decorators are required for
 * the streaming-ssr example. The renderer plugin adds `fastify.piscina` and
 * `fastify.runTask` via its own type declaration.
 *
 * @see @scratchyjs/renderer/plugin for the decorator registration.
 */
import "@scratchyjs/renderer/plugin";
