export { createAuth } from "./server.js";
export type { AuthInstance, CreateAuthOptions } from "./server.js";

export { createAuthClient } from "./client.js";
export type { AuthClient } from "./client.js";

export { default as authPlugin } from "./plugin.js";
export type { AuthPluginOptions, AuthSession, AuthUser } from "./plugin.js";

export { requireAdmin, requireAuth } from "./hooks.js";
