import type { FastifyPluginAsync } from "fastify";

const healthRoute: FastifyPluginAsync = async function (fastify) {
  fastify.get("/health", function () {
    return { status: "ok", timestamp: new Date().toISOString() };
  });
};

export default healthRoute;
