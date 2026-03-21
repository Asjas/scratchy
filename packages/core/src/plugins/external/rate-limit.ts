import fastifyRateLimit, {
  type FastifyRateLimitOptions,
} from "@fastify/rate-limit";

export const autoConfig: FastifyRateLimitOptions = {
  max: 1000,
  timeWindow: "1 minute",
  skipOnError: false,
};

export default fastifyRateLimit;
