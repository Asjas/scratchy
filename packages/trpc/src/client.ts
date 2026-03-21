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
 * (which `@scratchy/trpc` does by default).
 */
export function createClient<TRouter extends AnyRouter>(opts: ClientOptions) {
  return createTRPCClient<TRouter>({
    links: [
      httpBatchStreamLink<TRouter>(
        // The transformer type is inferred from the generic TRouter, but we
        // always use superjson (matching the server-side init in trpc.ts).
        // The cast is safe because Scratchy routers are always created with superjson.
        {
          url: opts.url,
          transformer: superjson,
          methodOverride: "POST",
          headers: opts.headers,
        } as unknown as Parameters<typeof httpBatchStreamLink<TRouter>>[0],
      ),
    ],
  });
}
