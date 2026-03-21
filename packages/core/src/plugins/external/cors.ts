import fastifyCors, { type FastifyCorsOptions } from "@fastify/cors";

export const autoConfig: FastifyCorsOptions = {
  credentials: true,
  maxAge: 86400,
  origin: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
};

export default fastifyCors;
