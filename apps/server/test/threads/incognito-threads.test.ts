import { getThread } from "@bb/db";
import { threadSchema } from "@bb/domain";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { waitForQueuedCommand } from "../helpers/commands.js";
import { readJson } from "../helpers/json.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
  seedThread,
} from "../helpers/seed.js";
import {
  withTestHarness as withBaseHarness,
  type TestAppHarness,
} from "../helpers/test-app.js";
import { registerFakeAiService } from "../helpers/ai-services.js";
import { installFakeGitWorktreeProvider } from "../helpers/environment-provider.js";

const completeTitle = vi.fn<(prompt: string) => Promise<string>>();

function withTestHarness<T>(
  run: (harness: TestAppHarness) => Promise<T>,
): Promise<T> {
  return withBaseHarness({}, (harness) => {
    registerFakeAiService(harness.deps.aiServices, {
      id: "codex",
      pluginId: "provider-codex",
      builtin: true,
      complete: (prompt) => completeTitle(prompt),
    });
    return run(harness);
  });
}

async function createThread(
  harness: TestAppHarness,
  args: { hostId: string; projectId: string; incognito: boolean },
) {
  const response = await harness.app.request("/api/v1/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: "app",
      projectId: args.projectId,
      providerId: "codex",
      model: "gpt-5",
      incognito: args.incognito,
      input: [
        { type: "text", text: "Explain this sensitive question in detail" },
      ],
      environment: {
        type: "host",
        hostId: args.hostId,
        workspace: {
          type: "managed-worktree",
          baseBranch: { kind: "default" },
        },
      },
    }),
  });
  expect(response.status).toBe(201);
  return threadSchema.parse(await readJson(response));
}

function seedReadyWorktreeHost(harness: TestAppHarness, id: string) {
  const { host } = seedHostSession(harness.deps, { id });
  const { project } = seedProjectWithSource(harness.deps, {
    hostId: host.id,
    path: `/tmp/${id}-project`,
  });
  seedEnvironment(harness.deps, {
    hostId: host.id,
    projectId: project.id,
    path: `/tmp/${id}-workspace`,
    status: "ready",
  });
  installFakeGitWorktreeProvider(() => ({
    action: "ready",
    environment: {
      type: "host",
      hostId: host.id,
      path: `/tmp/${id}-workspace`,
    },
  }));
  return { host, project };
}

describe("incognito threads", () => {
  beforeEach(() => {
    completeTitle.mockReset();
    completeTitle.mockResolvedValue("Generated Title");
  });

  it.each([
    { incognito: true, titleCalls: 0, telemetry: [] },
    {
      incognito: false,
      titleCalls: 1,
      telemetry: ["thread_created", "user_message_sent"],
    },
  ])(
    "starts the provider session ephemeral and skips titles and telemetry only when incognito is $incognito",
    async ({ incognito, titleCalls, telemetry }) => {
      await withTestHarness(async (harness) => {
        const capture = vi.spyOn(harness.deps.telemetry, "capture");
        const { host, project } = seedReadyWorktreeHost(
          harness,
          `host-incognito-${incognito}`,
        );

        const thread = await createThread(harness, {
          hostId: host.id,
          projectId: project.id,
          incognito,
        });
        expect(thread.incognito).toBe(incognito);

        const start = await waitForQueuedCommand(
          harness,
          ({ command }) =>
            command.type === "thread.start" && command.threadId === thread.id,
        );
        expect(start.command).toMatchObject({ ephemeral: incognito });
        expect(completeTitle).toHaveBeenCalledTimes(titleCalls);
        expect(capture.mock.calls.map(([event]) => event.name)).toEqual(
          telemetry,
        );
      });
    },
  );

  it("deletes an incognito thread and its incognito children when it is archived", async () => {
    await withTestHarness(async (harness) => {
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: seedHostSession(harness.deps, { id: "host-incognito-archive" })
          .host.id,
        path: "/tmp/incognito-archive-project",
      });
      const incognito = seedThread(harness.deps, {
        projectId: project.id,
        incognito: true,
      });
      const child = seedThread(harness.deps, {
        projectId: project.id,
        parentThreadId: incognito.id,
        incognito: true,
      });
      const regular = seedThread(harness.deps, { projectId: project.id });

      for (const thread of [incognito, regular]) {
        const response = await harness.app.request(
          `/api/v1/threads/${thread.id}/archive-all`,
          { method: "POST" },
        );
        expect(response.status).toBe(200);
      }

      expect(getThread(harness.db, incognito.id)?.deletedAt).not.toBeNull();
      expect(getThread(harness.db, child.id)?.deletedAt).not.toBeNull();
      const archivedRegular = getThread(harness.db, regular.id);
      expect(archivedRegular?.archivedAt).not.toBeNull();
      expect(archivedRegular?.deletedAt).toBeNull();
    });
  });

  it("refuses to regenerate an incognito thread's title", async () => {
    await withTestHarness(async (harness) => {
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: seedHostSession(harness.deps, { id: "host-incognito-title" })
          .host.id,
        path: "/tmp/incognito-title-project",
      });
      const thread = seedThread(harness.deps, {
        projectId: project.id,
        incognito: true,
      });

      const response = await harness.app.request(
        `/api/v1/threads/${thread.id}/title/regenerate`,
        { method: "POST" },
      );

      expect(response.status).toBe(409);
      expect(completeTitle).not.toHaveBeenCalled();
    });
  });
});
