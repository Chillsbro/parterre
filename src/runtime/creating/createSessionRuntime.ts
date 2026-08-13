import type {AppConfig} from "../../config/index.js";
import {isPlaywrightSessionOpen} from "../../playwright/index.js";
import {
  acquireSessionLease,
  createSession,
  markSessionResumed,
  markSessionResuming,
  updateSessionStatus
} from "../../sessions/index.js";
import type {AgentFactory, AgentHandle} from "../providers/index.js";
import {prepareSessionResume, resolveResumeConfig} from "../resuming/index.js";
import type {
  FrameFormat,
  RuntimeContext,
  RuntimeController,
  RuntimeNotification
} from "../types/index.js";
import {buildSessionMetadata} from "./buildSessionMetadata.js";
import {createRuntimeContext} from "./createRuntimeContext.js";
import {createRuntimeController} from "./createRuntimeController.js";
import {startRuntimeAgent} from "./startRuntimeAgent.js";
import {stopSessionRuntime} from "./stopSessionRuntime.js";

export async function createSessionRuntime(options: {
  config: AppConfig;
  onNotification: (notification: RuntimeNotification) => void;
  agentFactory?: AgentFactory;
  frameFormat?: FrameFormat;
  liveFrames?: boolean;
  resumeSessionId?: string | undefined;
}): Promise<RuntimeController> {
  const resume = options.resumeSessionId
    ? await prepareSessionResume({
        storageDir: options.config.storageDir,
        sessionId: options.resumeSessionId
      })
    : undefined;
  let lease: Awaited<ReturnType<typeof acquireSessionLease>> | undefined;
  let context: RuntimeContext | undefined;
  let agent: AgentHandle | undefined;
  try {
    if (resume && resume.metadata.workspace !== options.config.workspace) {
      throw new Error(
        `Session workspace changed: expected ${resume.metadata.workspace}, received ${options.config.workspace}`
      );
    }
    const config = resume
      ? resolveResumeConfig({
          metadata: resume.metadata,
          model: resume.model,
          storageDir: options.config.storageDir,
          playwrightCommand: options.config.playwrightCommand,
          redactions: options.config.redactions,
          baseUrl: options.config.baseUrl,
          allowUnverifiedRedactions: options.config.allowUnverifiedRedactions
        })
      : options.config;
    if (resume) {
      lease = await acquireSessionLease(
        options.config.storageDir,
        resume.metadata.id
      );
    }
    let browserReused = false;
    if (resume && resume.metadata.status !== "stopped") {
      browserReused = await isPlaywrightSessionOpen({
        command: config.playwrightCommand,
        workspace: config.workspace,
        playwrightSession: resume.metadata.playwrightSession
      });
    }
    const reusedPlaywrightSession =
      browserReused && resume ? resume.metadata.playwrightSession : undefined;
    context = createRuntimeContext({
      ...options,
      config,
      ...(resume ? {sessionId: resume.metadata.id} : {}),
      ...(reusedPlaywrightSession
        ? {
            playwrightSession: reusedPlaywrightSession,
            browserOpened: true
          }
        : {}),
      ...(lease ? {releaseSessionLease: lease.release} : {})
    });
    const metadata = resume?.metadata ?? buildSessionMetadata(context);
    if (resume) {
      for (const event of resume.displayEvents) {
        options.onNotification({type: "event", event});
      }
      await markSessionResuming(
        options.config.storageDir,
        context.sessionId,
        context.playwrightSession
      );
    } else {
      lease = await acquireSessionLease(
        options.config.storageDir,
        context.sessionId,
        {allowMissingSession: true}
      );
      context.releaseSessionLease = lease.release;
      await createSession(options.config.storageDir, metadata);
    }

    if (resume) {
      await context.publish({
        type: "browser_restore_warning",
        timestamp: new Date().toISOString(),
        message:
          "Resuming the persistent browser profile may restore authenticated website state."
      });
    }

    agent = await startRuntimeAgent(context, options.agentFactory, resume);
    if (resume) {
      await markSessionResumed(
        options.config.storageDir,
        context.sessionId,
        config.redactions
      );
    }

    await context.publish({
      ...(resume
        ? {
            type: "session_resumed" as const,
            provider: resume.metadata.agent,
            mode: resume.mode,
            browser: browserReused
              ? ("session" as const)
              : resume.lastUrl
                ? ("url" as const)
                : ("none" as const)
          }
        : {
            type: "session_started" as const,
            message: `${metadata.agent} started with Playwright session ${context.playwrightSession}`
          }),
      timestamp: new Date().toISOString()
    });
    await updateSessionStatus(
      options.config.storageDir,
      context.sessionId,
      "running"
    );
    options.onNotification({type: "status", status: "running"});

    return createRuntimeController(context, agent);
  } catch (error) {
    if (agent && context) {
      await stopSessionRuntime(context, agent, "failed").catch(() => {});
    } else {
      await lease?.release().catch(() => {});
    }
    throw error;
  }
}
