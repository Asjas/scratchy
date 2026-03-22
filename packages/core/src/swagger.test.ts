import type { FastifyInstance } from "fastify";
import Fastify from "fastify";
import {
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

async function buildServer(
  opts: Parameters<typeof import("./plugins/swagger.js").default>[1] = {},
) {
  const { default: swaggerPlugin } = await import("./plugins/swagger.js");
  const server = Fastify({ logger: false });
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  await server.register(swaggerPlugin, opts);

  // A sample route to verify it appears in the spec.
  server.get(
    "/items",
    {
      schema: {
        description: "List items",
        tags: ["items"],
        response: {
          200: z.object({ items: z.array(z.string()) }),
        },
      },
    },
    () => ({ items: ["a", "b"] }),
  );

  await server.ready();
  return server;
}

describe("swagger plugin", () => {
  let server: FastifyInstance;

  beforeEach(async () => {
    server = await buildServer();
  });

  afterEach(async () => {
    await server.close();
  });

  it("serves the Swagger UI at the default /documentation route", async () => {
    // Swagger UI serves HTML directly or redirects to /documentation/.
    const response = await server.inject({
      method: "GET",
      url: "/documentation",
    });

    if (response.statusCode === 302) {
      expect(response.headers.location).toMatch(/\/documentation\//);
    } else {
      expect(response.statusCode).toBe(200);
      expect(response.headers["content-type"]).toContain("text/html");
    }
  });

  it("serves the OpenAPI JSON spec at /documentation/json", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/documentation/json",
    });

    expect(response.statusCode).toBe(200);
    const spec = response.json<{
      openapi: string;
      info: { title: string; version: string };
      paths: Record<string, unknown>;
    }>();
    expect(spec.openapi).toBe("3.0.3");
    expect(spec.info.title).toBe("Scratchy API");
    expect(spec.info.version).toBe("0.0.1");
  });

  it("exposes registered routes in the OpenAPI spec", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/documentation/json",
    });

    expect(response.statusCode).toBe(200);
    const spec = response.json<{ paths: Record<string, unknown> }>();
    expect(spec.paths["/items"]).toBeDefined();
  });

  it("includes the bearerAuth security scheme in the spec", async () => {
    const response = await server.inject({
      method: "GET",
      url: "/documentation/json",
    });

    const spec = response.json<{
      components: {
        securitySchemes: {
          bearerAuth: { type: string; scheme: string };
        };
      };
    }>();
    expect(spec.components.securitySchemes.bearerAuth).toBeDefined();
    expect(spec.components.securitySchemes.bearerAuth.type).toBe("http");
    expect(spec.components.securitySchemes.bearerAuth.scheme).toBe("bearer");
  });

  it("respects custom routePrefix option", async () => {
    await server.close();
    server = await buildServer({ routePrefix: "/api-docs" });

    const defaultResponse = await server.inject({
      method: "GET",
      url: "/documentation/json",
    });
    expect(defaultResponse.statusCode).toBe(404);

    const customResponse = await server.inject({
      method: "GET",
      url: "/api-docs/json",
    });
    expect(customResponse.statusCode).toBe(200);
  });

  it("respects custom info options", async () => {
    await server.close();
    server = await buildServer({
      info: { title: "Custom API", version: "2.0.0", description: "My desc" },
    });

    const response = await server.inject({
      method: "GET",
      url: "/documentation/json",
    });
    const spec = response.json<{
      info: { title: string; version: string; description: string };
    }>();
    expect(spec.info.title).toBe("Custom API");
    expect(spec.info.version).toBe("2.0.0");
    expect(spec.info.description).toBe("My desc");
  });
});
