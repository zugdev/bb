import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import { buildFindPrompt, parseThreadIds, type CatalogEntry } from "./find.js";
import { threadFinderHostContract, threadFinderRpcContract, type ThreadMatch } from "./contract.js";

const ASK_TIMEOUT_MS = 90_000;
const FIRST_PROMPT_CONCURRENCY = 16;

function firstPromptText(data: unknown): string {
  if (typeof data !== "object" || data === null || !("input" in data) || !Array.isArray(data.input)) return "";
  return data.input
    .map((part: unknown) =>
      typeof part === "object" && part !== null && "text" in part && typeof part.text === "string" ? part.text : "",
    )
    .join(" ");
}

export default async function threadFinderPlugin(bb: BbPluginApi): Promise<void> {
  const settings = bb.settings.define({
    model: {
      type: "string",
      label: "Model",
      description: "The Claude model the local claude CLI uses to match your description against your threads.",
      default: "haiku",
    },
    includeArchived: {
      type: "boolean",
      label: "Search archived threads",
      description: "Include archived threads in the search.",
      default: true,
    },
  });
  const host = bb.hosts.experimental_client({ contract: threadFinderHostContract });
  const firstPrompts = new Map<string, string>();

  async function firstPrompt(threadId: string): Promise<string> {
    const cached = firstPrompts.get(threadId);
    if (cached !== undefined) return cached;
    const events = await bb.sdk.threads.events.list({
      threadId,
      types: ["client/turn/requested"],
      order: "asc",
      limit: "1",
    });
    const text = firstPromptText(events[0]?.data);
    firstPrompts.set(threadId, text);
    return text;
  }

  async function catalog(includeArchived: boolean) {
    const [projects, active, archived] = await Promise.all([
      bb.sdk.projects.list(),
      bb.sdk.threads.list({ archived: false }),
      includeArchived ? bb.sdk.threads.list({ archived: true }) : Promise.resolve([]),
    ]);
    const projectNames = new Map(projects.map((project) => [project.id, project.name]));
    const threads = [...active, ...archived];
    const prompts: string[] = [];
    for (let start = 0; start < threads.length; start += FIRST_PROMPT_CONCURRENCY) {
      const batch = threads.slice(start, start + FIRST_PROMPT_CONCURRENCY);
      prompts.push(...(await Promise.all(batch.map((thread) => firstPrompt(thread.id).catch(() => "")))));
    }
    return threads.map((thread, index) => ({
      thread,
      entry: {
        threadId: thread.id,
        projectName: projectNames.get(thread.projectId) ?? "",
        title: thread.title ?? "",
        firstPrompt: prompts[index] ?? "",
        updatedAt: thread.updatedAt,
      } satisfies CatalogEntry,
    }));
  }

  async function find(description: string): Promise<ThreadMatch[]> {
    const { model, includeArchived } = await settings.get();
    const rows = await catalog(includeArchived);
    const { primaryHostId } = await bb.sdk.system.config();
    if (primaryHostId === null) throw new Error("This bb server has no host daemon of its own");
    const { text } = await host.call(
      "ask",
      { prompt: buildFindPrompt(description, rows.map((row) => row.entry), Date.now()), model },
      { hostId: primaryHostId, timeoutMs: ASK_TIMEOUT_MS },
    );
    const byId = new Map(rows.map((row) => [row.thread.id, row]));
    return parseThreadIds(text, new Set(byId.keys())).flatMap((id) => {
      const row = byId.get(id);
      if (row === undefined) return [];
      return [
        {
          threadId: id,
          projectId: row.thread.projectId,
          title: row.entry.title || row.entry.firstPrompt.slice(0, 80) || id,
          projectName: row.entry.projectName,
          archived: row.thread.archivedAt !== null,
        },
      ];
    });
  }

  bb.rpc.register(threadFinderRpcContract, {
    find: async ({ description }) => ({ matches: await find(description) }),
  });

  bb.cli.register(
    defineCli({
      name: "thread-finder",
      summary: "Find a thread by describing it in plain words",
      description:
        "Sends each thread's title, project and first prompt with your description to the local claude CLI and prints the best matching threads, best first.",
      commands: {
        find: cliCommand({
          summary: "Find threads matching a description",
          positionals: [{ name: "description", description: "What you remember about the thread", required: true }],
          options: { json: { type: "boolean", description: "Emit machine-readable JSON" } },
          async run(input) {
            try {
              const matches = await find(input.positionals.description);
              const stdout = input.options.json
                ? JSON.stringify(matches)
                : matches.length === 0
                  ? "No matching threads"
                  : matches
                      .map((match) => `${match.threadId}  ${match.projectName}  ${match.title}${match.archived ? "  (archived)" : ""}`)
                      .join("\n");
              return { exitCode: 0, stdout };
            } catch (error) {
              throw new PluginCliError(error instanceof Error ? error.message : String(error), { code: "find_failed" });
            }
          },
        }),
      },
    }),
  );
}
