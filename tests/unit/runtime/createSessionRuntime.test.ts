import {expect, test} from "bun:test";
import {mkdtemp, rm} from "node:fs/promises";
import {tmpdir} from "node:os";
import {join, resolve} from "node:path";
import {
  type AgentFactory,
  createSessionRuntime
} from "../../../src/runtime/index.js";
import {
  acquireSessionLease,
  closeSessionDatabase,
  listSessions
} from "../../../src/sessions/index.js";

test("releases provider, browser, and lease after late startup failure", async () => {
  const storageDir = await mkdtemp(join(tmpdir(), "parterre-startup-failure-"));
  let disconnects = 0;
  const factory: AgentFactory = async () => ({
    async send() {},
    async sendAndWait() {},
    async interrupt() {
      return false;
    },
    async listModels() {
      return [];
    },
    async setModel() {},
    async disconnect() {
      disconnects += 1;
    }
  });
  try {
    await expect(
      createSessionRuntime({
        config: {
          provider: "copilot",
          workspace: resolve("."),
          model: "auto",
          storageDir,
          playwrightCommand: "/bin/true",
          redactions: []
        },
        agentFactory: factory,
        onNotification(notification) {
          if (
            notification.type === "event" &&
            notification.event.type === "session_started"
          ) {
            throw new Error("fixture notification failure");
          }
        }
      })
    ).rejects.toThrow("fixture notification failure");

    expect(disconnects).toBe(1);
    const session = (await listSessions(storageDir))[0]!;
    expect(session.status).toBe("failed");
    const lease = await acquireSessionLease(storageDir, session.id);
    await lease.release();
  } finally {
    closeSessionDatabase(storageDir);
    await rm(storageDir, {recursive: true, force: true});
  }
});
