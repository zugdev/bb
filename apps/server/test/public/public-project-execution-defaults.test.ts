import { getAppSettings, setAppSettings } from "@bb/db";
import {
  PERSONAL_PROJECT_ID,
  projectExecutionDefaultsSchema,
  threadSchema,
} from "@bb/domain";
import { describe, expect, it } from "vitest";
import { availableModelFixture } from "../helpers/available-models.js";
import { waitForQueuedCommand } from "../helpers/commands.js";
import { readJson } from "../helpers/json.js";
import { seedModelCatalog } from "../helpers/provider-model-catalogs.js";
import {
  seedEnvironment,
  seedHostSession,
  seedProjectWithSource,
} from "../helpers/seed.js";
import { withTestHarness, type TestAppHarness } from "../helpers/test-app.js";

function putDefaults(
  harness: TestAppHarness,
  projectId: string,
  body: Record<string, unknown>,
): Promise<Response> {
  return Promise.resolve(
    harness.app.request(
      `/api/v1/projects/${projectId}/default-execution-options`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      },
    ),
  );
}

async function getDefaults(
  harness: TestAppHarness,
  projectId: string,
): Promise<unknown> {
  const response = await harness.app.request(
    `/api/v1/projects/${projectId}/default-execution-options`,
  );
  expect(response.status).toBe(200);
  return readJson(response);
}

async function createThreadWithoutExecutionOptions(
  harness: TestAppHarness,
  args: { environmentId: string; projectId: string },
) {
  const response = await harness.app.request("/api/v1/threads", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      origin: "app",
      projectId: args.projectId,
      input: [{ type: "text", text: "Start on the saved defaults" }],
      environment: { type: "reuse", environmentId: args.environmentId },
    }),
  });
  expect(response.status).toBe(201);
  const thread = threadSchema.parse(await readJson(response));
  const queuedStart = await waitForQueuedCommand(
    harness,
    ({ command }) =>
      command.type === "thread.start" && command.threadId === thread.id,
  );
  return queuedStart.command;
}

describe("project default execution options routes", () => {
  it("sets, reads, and clears the personal project's defaults", async () => {
    await withTestHarness(async (harness) => {
      const setResponse = await putDefaults(harness, PERSONAL_PROJECT_ID, {
        providerId: "codex",
        model: "gpt-6.1-terra",
        reasoningLevel: "low",
      });
      expect(setResponse.status).toBe(200);
      const saved = projectExecutionDefaultsSchema.parse(
        await readJson(setResponse),
      );
      expect(saved).toMatchObject({
        providerId: "codex",
        model: "gpt-6.1-terra",
        reasoningLevel: "low",
        serviceTier: "default",
      });
      expect(await getDefaults(harness, PERSONAL_PROJECT_ID)).toEqual(saved);

      const clearResponse = await harness.app.request(
        `/api/v1/projects/${PERSONAL_PROJECT_ID}/default-execution-options`,
        { method: "DELETE" },
      );
      expect(clearResponse.status).toBe(200);
      expect(await getDefaults(harness, PERSONAL_PROJECT_ID)).toBeNull();
    });
  });

  it("rejects an unknown provider and keeps the previous defaults", async () => {
    await withTestHarness(async (harness) => {
      await putDefaults(harness, PERSONAL_PROJECT_ID, {
        providerId: "codex",
        model: "gpt-5",
        reasoningLevel: "high",
      });

      const response = await putDefaults(harness, PERSONAL_PROJECT_ID, {
        providerId: "not-a-provider",
        model: "gpt-5",
        reasoningLevel: "high",
      });

      expect(response.status).toBe(400);
      expect(await getDefaults(harness, PERSONAL_PROJECT_ID)).toMatchObject({
        providerId: "codex",
        model: "gpt-5",
      });
    });
  });

  it("starts omitted fields on the global defaults until the project sets its own", async () => {
    await withTestHarness(async (harness) => {
      const { host } = seedHostSession(harness.deps);
      await seedModelCatalog(harness, {
        hostId: host.id,
        providerId: "codex",
        models: [
          availableModelFixture({
            model: "gpt-catalog-default",
            reasoningLevels: ["low", "medium", "high"],
            isDefault: true,
          }),
          availableModelFixture({
            model: "gpt-5",
            reasoningLevels: ["low", "high"],
          }),
          availableModelFixture({
            model: "gpt-5-mini",
            reasoningLevels: ["low", "high"],
          }),
        ],
      });
      const { project } = seedProjectWithSource(harness.deps, {
        hostId: host.id,
        path: "/tmp/global-execution-defaults",
      });
      const environment = seedEnvironment(harness.deps, {
        hostId: host.id,
        projectId: project.id,
        path: "/tmp/global-execution-defaults",
      });
      setAppSettings(harness.db, {
        ...getAppSettings(harness.db),
        defaultProviderId: "codex",
        defaultModel: "gpt-5",
        defaultReasoningLevel: "high",
      });

      expect(
        await createThreadWithoutExecutionOptions(harness, {
          environmentId: environment.id,
          projectId: project.id,
        }),
      ).toMatchObject({
        providerId: "codex",
        options: { model: "gpt-5", reasoningLevel: "high" },
      });

      const setResponse = await putDefaults(harness, project.id, {
        providerId: "codex",
        model: "gpt-5-mini",
        reasoningLevel: "low",
      });
      expect(setResponse.status).toBe(200);

      expect(
        await createThreadWithoutExecutionOptions(harness, {
          environmentId: environment.id,
          projectId: project.id,
        }),
      ).toMatchObject({
        providerId: "codex",
        options: { model: "gpt-5-mini", reasoningLevel: "low" },
      });
    });
  });
});
