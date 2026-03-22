import fastifySwagger from "@fastify/swagger";
import fastifySwaggerUi from "@fastify/swagger-ui";
import type { FastifyInstance, FastifyPluginOptions } from "fastify";
import fp from "fastify-plugin";
import { jsonSchemaTransform } from "fastify-type-provider-zod";

/**
 * Options for the Swagger / OpenAPI documentation plugin.
 */
export interface SwaggerPluginOptions extends FastifyPluginOptions {
  /**
   * Base URL path where the Swagger UI will be served.
   * Defaults to `"/documentation"`.
   */
  routePrefix?: string;
  /**
   * OpenAPI info block — title, description, version.
   */
  info?: {
    title?: string;
    description?: string;
    version?: string;
  };
}

/**
 * Fastify plugin that mounts `@fastify/swagger` (OpenAPI spec generation)
 * and `@fastify/swagger-ui` (interactive documentation UI).
 *
 * Register this plugin **before** any routes so that every route schema is
 * captured in the generated spec. The Swagger UI is served at the path
 * configured by `routePrefix` (default: `/documentation`).
 *
 * @example
 * ```ts
 * import swaggerPlugin from "@scratchy/core/plugins/swagger";
 *
 * await server.register(swaggerPlugin, {
 *   routePrefix: "/docs",
 *   info: { title: "My API", version: "1.0.0" },
 * });
 * ```
 */
export default fp<SwaggerPluginOptions>(
  async function swaggerPlugin(
    fastify: FastifyInstance,
    opts: SwaggerPluginOptions,
  ) {
    const {
      routePrefix = "/documentation",
      info: {
        title = "Scratchy API",
        description = "REST API documentation",
        version = "0.0.1",
      } = {},
    } = opts;

    await fastify.register(fastifySwagger, {
      openapi: {
        openapi: "3.0.3",
        info: { title, description, version },
        components: {
          securitySchemes: {
            bearerAuth: {
              type: "http",
              scheme: "bearer",
              bearerFormat: "JWT",
            },
          },
        },
      },
      transform: jsonSchemaTransform,
    });

    await fastify.register(fastifySwaggerUi, {
      routePrefix,
      uiConfig: {
        docExpansion: "list",
        deepLinking: true,
      },
      staticCSP: true,
    });

    fastify.log.info({ routePrefix }, "swagger documentation available");
  },
  { name: "@scratchy/swagger" },
);
