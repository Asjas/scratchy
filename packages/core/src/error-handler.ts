import type {
  FastifyError,
  FastifyInstance,
  FastifyReply,
  FastifyRequest,
} from "fastify";
import { hasZodFastifySchemaValidationErrors } from "fastify-type-provider-zod";

export function setupErrorHandler(server: FastifyInstance): void {
  server.setNotFoundHandler(
    {
      preHandler: server.rateLimit({ max: 60, timeWindow: "1 hour" }),
    },
    function (_request: FastifyRequest, reply: FastifyReply) {
      return reply.status(404).send({
        error: "Not Found",
        message: "The requested resource was not found",
      });
    },
  );

  server.setErrorHandler(
    (error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
      if (hasZodFastifySchemaValidationErrors(error)) {
        return reply.status(400).send({
          error: "Validation Error",
          message: "Request doesn't match the schema",
          details: {
            issues: error.validation,
            method: request.method,
            url: request.url,
          },
        });
      }

      if (error.statusCode) {
        return reply.status(error.statusCode).send({
          error: error.name,
          message: error.message,
        });
      }

      request.log.error(error, "unhandled error");
      return reply.status(500).send({
        error: "Internal Server Error",
        message: "An unexpected error occurred",
      });
    },
  );
}
