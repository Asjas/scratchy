import type { Piscina } from "piscina";

declare module "fastify" {
  interface FastifyInstance {
    piscina: Piscina;
    runTask: <T = unknown, R = unknown>(task: T) => Promise<R>;
  }
}
