/**
 * Fastify module augmentation — ensures `fastify.db` and `fastify.pool` are
 * typed across the application without no-op runtime imports.
 *
 * @see @scratchy/drizzle/plugin for the decorator registration.
 */
import "@scratchy/drizzle/plugin";
