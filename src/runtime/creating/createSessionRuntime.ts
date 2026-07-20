import type {AppConfig} from "../../config/index.js";
import {createSession, updateSessionStatus} from "../../sessions/index.js";
import type {AgentFactory} from "../providers/index.js";
import type {
  FrameFormat,
  RuntimeController,
  RuntimeNotification
} from "../types/index.js";
import {buildSessionMetadata} from "./buildSessionMetadata.js";
import {createRuntimeContext} from "./createRuntimeContext.js";
import {createRuntimeController} from "./createRuntimeController.js";
import {startRuntimeAgent} from "./startRuntimeAgent.js";

export async function createSessionRuntime(options: {
  config: AppConfig;
  onNotification: (notification: RuntimeNotification) => void;
  agentFactory?: AgentFactory;
  frameFormat?: FrameFormat;
}): Promise<RuntimeController> {
  const context = createRuntimeContext(options);
  const metadata = buildSessionMetadata(context);
  await createSession(options.config.storageDir, metadata);

  const agent = await startRuntimeAgent(context, options.agentFactory);

  await context.publish({
    type: "session_started",
    timestamp: new Date().toISOString(),
    message: `${metadata.agent} started with Playwright session ${context.playwrightSession}`
  });
  await updateSessionStatus(
    options.config.storageDir,
    context.sessionId,
    "running"
  );
  options.onNotification({type: "status", status: "running"});

  return createRuntimeController(context, agent);
}
