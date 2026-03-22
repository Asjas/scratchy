/**
 * Fastify module augmentation — ensures `fastify.db` and `fastify.pool` are
 * typed across the application without no-op runtime imports.
 *
 * @see @scratchyjs/drizzle/plugin for the decorator registration.
 */
/**
 * Fastify module augmentation — ensures `request.session` and `request.user`
 * are typed across the application when the auth plugin is registered.
 *
 * @see @scratchyjs/auth/plugin for the decorator registration.
 */
import "@scratchyjs/auth/plugin";
import "@scratchyjs/drizzle/plugin";
