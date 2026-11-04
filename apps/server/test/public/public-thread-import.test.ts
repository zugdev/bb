import { getStoredProviderSession, getThread, listEvents } from "@bb/db";
import { turnRequestEventDataSchema } from "@bb/domain";
import type { ProviderSessionsReadResult } from "@bb/host-daemon-contract";
import { threadResponseSchema } from "@bb/server-contract";
import { describe, expect, it, vi } from "vitest";
import {
  registerHostRpcResponder,
  type HostRpcHandlerResult,
} from "../helpers/host-rpc.js";
import { availableModelFixture } from "../helpers/available-models.js";
import { readJson } from "../helpers/json.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
} from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

const PROJECT_PATH = "/tmp/public-thread-import";
const SESSION_ID = "4b1d9c1e-2f0a-4a8e-9a55-0d6f3c2b7e10";
const FIRST_PROMPT_AT = Date.parse("2026-02-03T04:05:06.000Z");

function importedTurn(index: number, prompt: string, answer: string) {
  const turnId = `imported-t${index}`;
  const startedAt = FIRST_PROMPT_AT + index * 60_000;
  const turnScope = { kind: "turn" as const, turnId };
  return {
    prompt,
    startedAt,
    events: [
      {
        at: startedAt,
        event: {
          type: "turn/started" as const,
          threadId: "",
          providerThreadId: "",
          scope: turnScope,
        },
      },
      {
        at: startedAt + 1_000,
        event: {
          type: "item/completed" as const,
          threadId: "",
          providerThreadId: "",
          scope: turnScope,
          item: {
            type: "agentMessage" as const,
            id: `item-${index}`,
            text: answer,
          },
        },
      },
      {
        at: startedAt + 2_000,
        event: {
          type: "turn/completed" as const,
          threadId: "",
          providerThreadId: "",
          scope: turnScope,
          status: "completed" as const,
        },
      },
    ],
  };
}

function importedSession(
  cwd: string,
  repositoryRoot: string | null,
): ProviderSessionsReadResult {
  return {
    sessionId: SESSION_ID,
    cwd,
    repositoryRoot,
    truncated: false,
    turns: [
      importedTurn(1, "Explain the build script", "It runs turbo."),
      importedTurn(2, "Now add a test", "Added one test."),
    ],
  };
}

function respondWithSession(
  harness: TestAppHarness,
  cwd: string,
  repositoryRoot: string | null = null,
): ReturnType<typeof registerHostRpcResponder> & { hostId: string } {
  const { host, session } = seedHostSession(harness.deps, {
    id: "host-thread-import",
  });
  const responder = registerHostRpcResponder(harness, {
    hostId: host.id,
    sessionId: session.id,
    handle(request): HostRpcHandlerResult {
      switch (request.command.type) {
        case "provider.sessions.read":
          return { ok: true, result: importedSession(cwd, repositoryRoot) };
        case "provider.list_models":
          return {
            ok: true,
            result: {
              models: [
                availableModelFixture({
                  model: "claude-test",
                  isDefault: true,
                }),
              ],
              selectedOnlyModels: [],
            },
          };
        default:
          throw new Error(`Unexpected command ${request.command.type}`);
      }
    },
  });
  return { ...responder, hostId: host.id };
}

async function postImport(harness: TestAppHarness, hostId: string) {
  return harness.app.request("/api/v1/threads/import", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ hostId, sessionId: SESSION_ID }),
  });
}

describe("POST /api/v1/threads/import", () => {
  it("writes the session's turns as history and claims its provider session", async () => {
    await withTestHarness(async (harness) => {
      const responder = respondWithSession(harness, PROJECT_PATH);
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: responder.hostId,
        path: PROJECT_PATH,
      });
      const environment = seedEnvironment(harness.deps, {
        hostId: responder.hostId,
        projectId: project.id,
        path: PROJECT_PATH,
      });
      try {
        const response = await postImport(harness, responder.hostId);
        expect(response.status).toBe(201);
        const thread = threadResponseSchema.parse(await readJson(response));
        expect(thread.projectId).toBe(project.id);
        expect(thread.title).toBe("Explain the build script");

        const events = listEvents(harness.db, { threadId: thread.id });
        const history = events.filter(
          (event) => event.type !== "system/thread-provisioning",
        );
        expect(history.map((event) => event.type)).toEqual([
          "client/turn/requested",
          "turn/started",
          "turn/input/accepted",
          "item/completed",
          "turn/completed",
          "client/turn/requested",
          "turn/started",
          "turn/input/accepted",
          "item/completed",
          "turn/completed",
          "thread/identity",
        ]);
        const [firstRequest] = history;
        expect(firstRequest?.createdAt).toBe(FIRST_PROMPT_AT + 60_000);
        const request = turnRequestEventDataSchema.parse(
          JSON.parse(firstRequest!.data),
        );
        expect(request.initiator).toBe("user");
        expect(request.input).toEqual([
          { type: "text", text: "Explain the build script", mentions: [] },
        ]);
        const accepted = JSON.parse(history[2]!.data) as {
          clientRequestId: string;
        };
        expect(accepted.clientRequestId).toBe(request.requestId);
        expect(history.at(-1)?.providerThreadId).toBe(SESSION_ID);
        expect(getStoredProviderSession(harness.db, thread.id)).toEqual({
          kind: "owned",
          providerThreadId: SESSION_ID,
        });

        await vi.waitFor(() => {
          expect(getThread(harness.db, thread.id)?.status).toBe("idle");
        });
        expect(getThread(harness.db, thread.id)?.environmentId).toBe(
          environment.id,
        );
        expect(
          responder.requests.map((request) => request.command.type),
        ).not.toContain("thread.start");

        const duplicate = await postImport(harness, responder.hostId);
        expect(duplicate.status).toBe(409);
      } finally {
        responder.unregister();
      }
    });
  });

  it("files a session from a git worktree under its main repository's project", async () => {
    await withTestHarness(async (harness) => {
      const worktreePath = `${PROJECT_PATH}-trees/feature`;
      const responder = respondWithSession(
        harness,
        worktreePath,
        PROJECT_PATH,
      );
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: responder.hostId,
        path: PROJECT_PATH,
      });
      try {
        const response = await postImport(harness, responder.hostId);
        expect(response.status).toBe(201);
        const thread = threadResponseSchema.parse(await readJson(response));
        expect(thread.projectId).toBe(project.id);
      } finally {
        responder.unregister();
      }
    });
  });

  it("asks for the session's folder to be added as a project when none matches", async () => {
    await withTestHarness(async (harness) => {
      const responder = respondWithSession(harness, "/tmp/not-a-project");
      seedProjectWithSource(harness.deps, {
        hostId: responder.hostId,
        path: PROJECT_PATH,
      });
      try {
        const response = await postImport(harness, responder.hostId);
        expect(response.status).toBe(400);
        expect(await response.text()).toContain("Add that folder as a project");
      } finally {
        responder.unregister();
      }
    });
  });
});
