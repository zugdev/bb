import { listEvents, listQueuedThreadMessages } from "@bb/db";
import { turnRequestEventDataSchema, turnScope } from "@bb/domain";
import { HOST_DAEMON_PROTOCOL_VERSION } from "@bb/host-daemon-contract";
import { describe, expect, it, vi } from "vitest";
import { internalAuthHeaders } from "../helpers/commands.js";
import {
  seedThread,
  seedThreadFixture,
  seedStoredEvent,
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

  it("resumes an idle thread whose background command the restart stopped", async () => {
    await withTestHarness(async (harness) => {
      const { host, project, environment, thread } = seedThreadFixture(
        harness,
        { thread: { status: "idle" } },
      );
      seedThreadRuntimeState(harness.deps, {
        environmentId: environment.id,
        providerThreadId: "claude-session-1",
        threadId: thread.id,
      });
      seedStoredEvent(harness.deps, {
        threadId: thread.id,
        environmentId: environment.id,
        sequence: 10,
        type: "item/started",
        scope: turnScope("turn-that-started-the-command"),
        providerThreadId: "claude-session-1",
        itemId: "task:gates",
        itemKind: "backgroundTask",
        data: {
          providerThreadId: "claude-session-1",
          item: {
            id: "task:gates",
            type: "backgroundTask",
            taskType: "local_bash",
            description: "run gates",
            status: "pending",
            taskStatus: "running",
            skipTranscript: false,
            foreground: false,
          },
        },
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
