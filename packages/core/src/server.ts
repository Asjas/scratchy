import type { Config } from "./config.js";
import { setupErrorHandler } from "./error-handler.js";
import { fastifyAutoload } from "@fastify/autoload";
import Fastify, { type FastifyHttpOptions } from "fastify";
import {
  type ZodTypeProvider,
  serializerCompiler,
  validatorCompiler,
} from "fastify-type-provider-zod";
import type http from "node:http";
import { join } from "node:path";

const ONE_MINUTE = 60_000;
const TEN_SECONDS = 10_000;
const FIFTEEN_SECONDS = 15_000;
const TEN_MB = 10 * 1024 * 1024;

/**
 * Creates and configures the Fastify server instance.
 * @param config - Server configuration object.
 * @returns Configured Fastify instance ready to listen.
 */
async function createServer(config: Config) {
  const opts: FastifyHttpOptions<http.Server> = {
    trustProxy: config.TRUST_PROXY,
    disableRequestLogging: true,
    logger: {
      level: config.LOG_LEVEL,
    },
    requestTimeout: ONE_MINUTE,
    keepAliveTimeout: TEN_SECONDS,
    bodyLimit: config.BODY_LIMIT ?? TEN_MB,
    routerOptions: {
      ignoreTrailingSlash: true,
      maxParamLength: 5000,
    },
    http: {
      headersTimeout: FIFTEEN_SECONDS,
    },
  };

  const server = Fastify(opts).withTypeProvider<ZodTypeProvider>();

  server.decorate("config", config);
  server.setValidatorCompiler(validatorCompiler);
  server.setSerializerCompiler(serializerCompiler);

  await server.register(fastifyAutoload, {
    dir: join(import.meta.dirname, "plugins", "external"),
    encapsulate: false,
  });

  await server.register(fastifyAutoload, {
    dir: join(import.meta.dirname, "plugins", "app"),
    encapsulate: false,
  });

  await server.register(fastifyAutoload, {
    dir: join(import.meta.dirname, "routes"),
    dirNameRoutePrefix: false,
    matchFilter: /\.(?:ts|js)$/,
  });

  setupErrorHandler(server);

  return server;
}

export default createServer;
