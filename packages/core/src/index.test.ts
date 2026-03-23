import { definePlugin } from "./index.js";
import type { FastifyPluginOptions } from "fastify";
import Fastify from "fastify";
import { describe, expect, it } from "vitest";

describe("definePlugin", () => {
  it("wraps a Fastify plugin and decorates the server in the parent scope", async () => {
    const myPlugin = definePlugin<FastifyPluginOptions>(async (fastify) => {
      fastify.decorate("testValue", 42);
    });

    const server = Fastify({ logger: false });
    await server.register(myPlugin);
    await server.ready();

    expect((server as typeof server & { testValue: number }).testValue).toBe(
      42,
    );

    await server.close();
  });

  it("passes the plugin name to fastify-plugin", async () => {
    async function namedPlugin(fastify: import("fastify").FastifyInstance) {
      fastify.decorate("namedValue", "hello");
    }

    const wrapped = definePlugin<FastifyPluginOptions>(namedPlugin, {
      name: "my-named-plugin",
    });

    const server = Fastify({ logger: false });
    await server.register(wrapped);
    await server.ready();

    expect((server as typeof server & { namedValue: string }).namedValue).toBe(
      "hello",
    );

    await server.close();
  });

  it("uses the function name when no name option is provided", async () => {
    async function autoNamedPlugin(fastify: import("fastify").FastifyInstance) {
      fastify.decorate("autoValue", true);
    }

    const wrapped = definePlugin<FastifyPluginOptions>(autoNamedPlugin);

    const server = Fastify({ logger: false });
    await server.register(wrapped);
    await server.ready();

    expect((server as typeof server & { autoValue: boolean }).autoValue).toBe(
      true,
    );

    await server.close();
  });
});
