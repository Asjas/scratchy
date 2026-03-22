/**
 * Fastify module augmentation — ensures `fastify.db` and `fastify.pool` are
 * typed across the application without no-op runtime imports.
 *
 * @see @scratchy/drizzle/plugin for the decorator registration.
 */
/**
 * Fastify module augmentation — ensures `request.session` and `request.user`
 * are typed across the application when the auth plugin is registered.
 *
 * @see @scratchy/auth/plugin for the decorator registration.
 */
import "@scratchy/auth/plugin";
import "@scratchy/drizzle/plugin";
