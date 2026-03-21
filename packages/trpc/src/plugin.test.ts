import { publicProcedure, router } from "./trpc.js";
import Fastify from "fastify";
import superjson from "superjson";
import { afterEach, describe, expect, it } from "vitest";
import { z } from "zod";

describe("tRPC plugin", () => {
  afterEach(async () => {
    // Each test creates and closes its own server
  });

  it("should register the tRPC adapter and respond to queries", async () => {
    const appRouter = router({
      greeting: publicProcedure
        .input(z.object({ name: z.string() }))
        .query(({ input }) => {
          return { message: `Hello, ${input.name}!` };
        }),
    });

    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, { router: appRouter });
    await server.ready();

    expect(server.trpcPrefix).toBe("/trpc");

    // tRPC with superjson expects input encoded via superjson.serialize()
    const encodedInput = encodeURIComponent(
      JSON.stringify(superjson.serialize({ name: "World" })),
    );

    const response = await server.inject({
      method: "GET",
      url: `/trpc/greeting?input=${encodedInput}`,
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    // superjson wraps the result data in a { json: ... } envelope
    expect(body.result.data.json).toEqual({ message: "Hello, World!" });

    await server.close();
  });

  it("should support a custom prefix", async () => {
    const appRouter = router({
      ping: publicProcedure.query(() => {
        return { pong: true };
      }),
    });

    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, {
      router: appRouter,
      prefix: "/api/trpc",
    });

    await server.ready();

    expect(server.trpcPrefix).toBe("/api/trpc");

    const response = await server.inject({
      method: "GET",
      url: "/api/trpc/ping",
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.result.data.json).toEqual({ pong: true });

    await server.close();
  });

  it("should handle mutations via POST", async () => {
    const appRouter = router({
      createItem: publicProcedure
        .input(z.object({ title: z.string() }))
        .mutation(({ input }) => {
          return { id: "item-1", title: input.title };
        }),
    });

    const plugin = (await import("./plugin.js")).default;
    const server = Fastify({ logger: false });

    await server.register(plugin, { router: appRouter });
    await server.ready();

    // POST mutations use superjson serialization in the body
    const response = await server.inject({
      method: "POST",
      url: "/trpc/createItem",
      payload: superjson.serialize({ title: "My Item" }),
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.result.data.json).toEqual({ id: "item-1", title: "My Item" });

    await server.close();
  });
});
