import type { AnyRouter } from "@trpc/server";
import type { FastifyInstance } from "fastify";
import fp from "fastify-plugin";

export interface TrpcPluginOptions<TRouter extends AnyRouter> {
  /** The tRPC app router to register. */
  router: TRouter;
  /** Prefix for the tRPC endpoint (default: `/trpc`). */
  prefix?: string;
}

declare module "fastify" {
  interface FastifyInstance {
    trpcPrefix: string;
  }
}

/**
 * Fastify plugin that registers the tRPC Fastify adapter at the
 * configured prefix. Sets cache-control headers and logs tRPC errors.
 */
export default fp<TrpcPluginOptions<AnyRouter>>(
  async function trpcPlugin(
    fastify: FastifyInstance,
    opts: TrpcPluginOptions<AnyRouter>,
  ) {
    const { fastifyTRPCPlugin } = await import("@trpc/server/adapters/fastify");
    const { createContext } = await import("./context.js");

    const prefix = opts.prefix ?? "/trpc";
    fastify.decorate("trpcPrefix", prefix);

    await fastify.register(fastifyTRPCPlugin, {
      prefix,
      trpcOptions: {
        router: opts.router,
        createContext,
        responseMeta() {
          return {
            headers: {
              "cache-control": "no-store, no-cache, must-revalidate, private",
            },
          };
        },
        onError({
          path,
          error,
          type,
          input,
        }: {
          path: string | undefined;
          error: Error;
          type: string;
          input: unknown;
        }) {
          fastify.log.error(
            { path, type, input, err: error },
            "tRPC error on %s",
            path,
          );
        },
      },
    });

    fastify.log.info({ prefix }, "tRPC plugin registered");
  },
  { name: "@scratchyjs/trpc" },
);
