import fastifyHelmet, { type FastifyHelmetOptions } from "@fastify/helmet";

export const autoConfig: FastifyHelmetOptions = {
  hidePoweredBy: true,
  contentSecurityPolicy: false,
  xContentTypeOptions: true,
  xFrameOptions: { action: "deny" },
  hsts: { maxAge: 31536000, includeSubDomains: true },
  referrerPolicy: { policy: "no-referrer" },
  xPermittedCrossDomainPolicies: { permittedPolicies: "none" },
  crossOriginEmbedderPolicy: false,
  crossOriginOpenerPolicy: false,
  crossOriginResourcePolicy: false,
};

export default fastifyHelmet;
