import { createTRPCClient, httpBatchStreamLink } from "@trpc/client";
import type { HTTPHeaders } from "@trpc/client";
import type { AnyRouter } from "@trpc/server";
import superjson from "superjson";

export interface ClientOptions {
  /** The URL to the tRPC endpoint (e.g., `"/trpc"` or `"http://localhost:3000/trpc"`). */
  url: string;
  /** Additional headers to include with every request. */
  headers?: HTTPHeaders | (() => HTTPHeaders | Promise<HTTPHeaders>);
}

/**
 * Create a type-safe tRPC client configured with `httpBatchStreamLink`,
 * superjson transformer, and POST method override for E2E testing compatibility.
 *
 * The router **must** be initialized with `superjson` as its transformer
 * (which `@scratchyjs/trpc` does by default).
 */
export function createClient<TRouter extends AnyRouter>(opts: ClientOptions) {
  // tRPC's `httpBatchStreamLink` expects the transformer option to match the
  // router's inferred transformer type (encoded in `TRouter["_def"]["_config"]`).
  // Because `TRouter` is generic, TypeScript cannot verify at compile time that
  // `superjson` satisfies the constraint. The cast through `unknown` is necessary
  // to bridge this gap. It is safe because all Scratchy routers are initialised
  // with `superjson` in `@scratchyjs/trpc`'s `trpc.ts`.
  type LinkOptions = Parameters<typeof httpBatchStreamLink<TRouter>>[0];

  return createTRPCClient<TRouter>({
    links: [
      httpBatchStreamLink<TRouter>({
        url: opts.url,
        transformer: superjson,
        methodOverride: "POST",
        headers: opts.headers,
      } as unknown as LinkOptions),
    ],
  });
}
