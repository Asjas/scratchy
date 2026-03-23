export { wrapInShell } from "./templates/shell.js";
export type { ShellOptions } from "./templates/shell.js";

export {
  BufferStatus,
  createSharedBuffer,
  readFromBuffer,
  writeToBuffer,
} from "./shared-buffer.js";
export type { SharedBuffer } from "./shared-buffer.js";

export { SharedRingBuffer } from "./ring-buffer.js";

export {
  cleanupRenderContext,
  getRenderContext,
  storeRenderContext,
  storeRenderResult,
} from "./redis-comm.js";

export { createSSRHandler } from "./ssr-handler.js";
export type { SSRHandlerOptions } from "./ssr-handler.js";

export { createStreamingSSRHandler } from "./streaming-ssr-handler.js";
export type { StreamingSSRHandlerOptions } from "./streaming-ssr-handler.js";

export { runSsgPipeline } from "./ssg-pipeline.js";
export type {
  SsgPipelineOptions,
  SsgPipelineResult,
  SsgRouteFailure,
  SsgRouteResult,
} from "./ssg-pipeline.js";

export type { RendererPluginOptions } from "./plugin.js";
export type {
  NonStreamingRenderTask,
  RenderResult,
  RenderTask,
  StreamingRenderResult,
  StreamingRenderTask,
} from "./worker.js";
