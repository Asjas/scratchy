import closeWithGrace from "close-with-grace";
import type { FastifyInstance } from "fastify";

export function setupShutdown(
  server: FastifyInstance,
  onShutdown?: () => Promise<void>,
): void {
  process.on("uncaughtException", (err) => {
    server.log.error({ err }, "Uncaught Exception occurred");
  });

  process.on("unhandledRejection", (reason, promise) => {
    server.log.error({ reason, promise }, "Unhandled Rejection occurred");
  });

  closeWithGrace(async function ({ signal, err }) {
    if (err) {
      server.log.error({ err }, "Server closing with error");
    } else {
      server.log.info(`${signal} received, server closing`);
    }

    if (onShutdown) {
      await onShutdown();
    }

    await server.close();
  });
}
