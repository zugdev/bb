import { randomUUID } from "node:crypto";
import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { backlogItemSchema, backlogRpcContract, type BacklogItem } from "./backlog-contract.js";

const backlogKey = (projectId: string) => `backlog:${projectId}`;

export default function home(bb: BbPluginApi) {
  bb.settings.define({
    showFilters: {
      type: "boolean",
      label: "Show thread filters",
      description:
        "Show the status (All, Running, Needs you) and age (Any age, 7d+, 30d+) filters on the New thread page.",
      default: false,
    },
  });

  async function readBacklog(projectId: string): Promise<BacklogItem[]> {
    const parsed = backlogItemSchema.array().safeParse(await bb.storage.kv.get<unknown>(backlogKey(projectId)));
    return parsed.success ? parsed.data : [];
  }

  async function writeBacklog(projectId: string, items: BacklogItem[]): Promise<void> {
    await bb.storage.kv.set(backlogKey(projectId), items);
    bb.rpc.experimental_invalidate([backlogKey(projectId)]);
  }

  async function addBacklogItem(projectId: string, title: string): Promise<BacklogItem> {
    await bb.sdk.projects.get({ projectId });
    const item = { id: randomUUID().slice(0, 8), title, createdAt: Date.now() };
    await writeBacklog(projectId, [...(await readBacklog(projectId)), item]);
    return item;
  }

  async function finishBacklogItem(projectId: string, id: string): Promise<void> {
    const items = await readBacklog(projectId);
    if (!items.some((item) => item.id === id)) throw new Error(`No backlog item ${id} in ${projectId}.`);
    await writeBacklog(projectId, items.filter((item) => item.id !== id));
  }

  bb.rpc.register(backlogRpcContract, {
    async "backlog.list"({ projectId }) {
      return { items: await readBacklog(projectId) };
    },
    async "backlog.add"({ projectId, title }) {
      return addBacklogItem(projectId, title);
    },
    async "backlog.done"({ projectId, id }) {
      await finishBacklogItem(projectId, id);
      return { ok: true as const };
    },
  });

  const projectOption = {
    project: { type: "string" as const, description: "Project id, for example proj_abc123", required: true as const },
  };

  bb.cli.register(
    defineCli({
      name: "backlog",
      summary: "Keep a backlog per project, shown on the New thread page when the project is selected",
      commands: {
        list: cliCommand({
          summary: "List a project's backlog",
          options: projectOption,
          async run(input) {
            const items = await readBacklog(input.options.project);
            return {
              exitCode: 0,
              stdout: items.length === 0 ? "Backlog is empty." : items.map((item) => `${item.id}  ${item.title}`).join("\n"),
            };
          },
        }),
        add: cliCommand({
          summary: "Add an item to a project's backlog",
          positionals: [{ name: "title", description: "What to do", required: true }],
          options: projectOption,
          async run(input) {
            const item = await addBacklogItem(input.options.project, input.positionals.title.trim());
            return { exitCode: 0, stdout: item.id };
          },
        }),
        done: cliCommand({
          summary: "Remove an item from a project's backlog",
          positionals: [{ name: "id", description: "Item id from bb backlog list", required: true }],
          options: projectOption,
          async run(input) {
            await finishBacklogItem(input.options.project, input.positionals.id);
            return { exitCode: 0, stdout: `Removed ${input.positionals.id}.` };
          },
        }),
      },
    }),
  );
}
