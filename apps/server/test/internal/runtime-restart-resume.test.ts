import { listEvents, listQueuedThreadMessages } from "@bb/db";
import { turnRequestEventDataSchema } from "@bb/domain";
import { HOST_DAEMON_PROTOCOL_VERSION } from "@bb/host-daemon-contract";
import { describe, expect, it, vi } from "vitest";
import { internalAuthHeaders } from "../helpers/commands.js";
import {
  seedThread,
  seedThreadFixture,
  seedThreadRuntimeState,
  seedTurnStarted,
} from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

function restartResumeCount(harness: TestAppHarness, threadId: string): number {
  const requested = listEvents(harness.db, { threadId })
    .filter((row) => row.type === "client/turn/requested")
    .map((row) => turnRequestEventDataSchema.parse(JSON.parse(row.data)))
    .filter((data) => data.systemMessageKind === "runtime-restarted").length;
  const queued = listQueuedThreadMessages(harness.db, threadId).filter(
    (row) => row.systemNotice?.includes('"runtime-restarted"') === true,
  ).length;
  return requested + queued;
}

async function openRestartedSession(
  harness: TestAppHarness,
  hostId: string,
): Promise<void> {
  const response = await harness.app.request("/internal/session/open", {
    method: "POST",
    headers: internalAuthHeaders(harness, { hostId }),
    body: JSON.stringify({
      hostId,
      instanceId: "instance-after-update",
      hostName: "Test Host",
      hasMachineCredential: false,
      platform: "darwin",
      dataDir: "/tmp/host-daemon-restarted",
      localApiPort: null,
      protocolVersion: HOST_DAEMON_PROTOCOL_VERSION,
      activeThreads: [],
      openThreadWork: [],
    }),
  });
  expect(response.status).toBe(201);
}

describe("resume after a runtime restart", () => {
  it("queues one resume message for each thread whose turn the restart cut", async () => {
    await withTestHarness(async (harness) => {
      const { host, project, environment, thread } = seedThreadFixture(
        harness,
        { thread: { status: "active" } },
      );
      seedThreadRuntimeState(harness.deps, {
        environmentId: environment.id,
        providerThreadId: "provider-turn-cut-by-update",
        threadId: thread.id,
      });
      seedTurnStarted(harness.deps, {
        environmentId: environment.id,
        providerThreadId: "provider-turn-cut-by-update",
        threadId: thread.id,
        turnId: "turn-cut-by-update",
      });
      const idleThread = seedThread(harness.deps, {
        projectId: project.id,
        environmentId: environment.id,
        status: "idle",
      });

      await openRestartedSession(harness, host.id);

      await vi.waitFor(() =>
        expect(restartResumeCount(harness, thread.id)).toBe(1),
      );
      expect(restartResumeCount(harness, idleThread.id)).toBe(0);
    });
  });
});
