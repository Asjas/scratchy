import { loadAppConfig } from "./config.js";
import { buildServer } from "./server.js";
import { setupShutdown } from "@scratchy/core";

const config = loadAppConfig();
const server = await buildServer({ config });

setupShutdown(server);

await server.listen({ port: config.PORT, host: config.HOST });
