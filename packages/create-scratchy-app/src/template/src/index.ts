import { setupShutdown } from "@scratchyjs/core";
import { loadAppConfig } from "~/config.js";
import { buildServer } from "~/server.js";

const config = loadAppConfig();
const server = await buildServer({ config });

setupShutdown(server);

await server.listen({ port: config.PORT, host: config.HOST });
