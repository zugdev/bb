import { randomUUID } from "node:crypto";
import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { ideasRpcContract, type Idea, type ProviderForecast } from "./contract.js";
import { forecastWeekly, shouldStartIdeas } from "./forecast.js";

const IDEAS_KEY = "ideas";
const PANEL_KEY = "ideas/ideas";
const PLACED_KEY = "placedInSidebar";
const ASSISTANT_PANEL_KEY = "assistant/assistant";
const RUNNING_STATUSES = new Set(["starting", "active", "stopping"]);

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    startWithinHours: {
      type: "number",
      label: "Start ideas in the last hours of the week",
      description: "Queued ideas only start once the weekly limit resets within this many hours.",
      default: 48,
    },
    targetPercent: {
      type: "number",
      label: "Target weekly usage (%)",
      description: "Start ideas while the projected weekly usage at reset stays under this percent.",
      default: 90,
    },
    maxRunning: {
      type: "number",
      label: "Ideas running at once",
      default: 2,
    },
  });

  const readIdeas = async () => (await bb.storage.kv.get<Idea[]>(IDEAS_KEY)) ?? [];
  const writeIdeas = async (ideas: Idea[]) => {
    await bb.storage.kv.set(IDEAS_KEY, ideas);
    bb.rpc.experimental_invalidate(["state"]);
  };

  async function forecasts(): Promise<ProviderForecast[]> {
    const { startWithinHours, targetPercent } = await settings.get();
    const [usage, providers] = await Promise.all([
      bb.sdk.system.usageLimits(),
      bb.sdk.providers.list({ capability: "usage" }),
    ]);
    const now = Date.now();
    return Object.entries(usage).flatMap(([providerId, reading]) => {
      if (reading.status !== "ok") return [];
      const weekly = reading.windows.find(
        (window) => window.kind === "weekly" && !window.model && window.resetsAt,
      );
      if (weekly?.resetsAt == null) return [];
      const forecast = forecastWeekly({ usedPercent: weekly.usedPercent, resetsAt: weekly.resetsAt }, now);
      return [
        {
          providerId,
          displayName: providers.find((provider) => provider.id === providerId)?.displayName ?? providerId,
          usedPercent: forecast.usedPercent,
          projectedPercent: forecast.projectedPercent,
          resetsAt: forecast.resetsAt,
          startsIdeas: shouldStartIdeas(forecast, { startWithinHours, targetPercent }),
        },
      ];
    });
  }

  async function addIdea(input: Pick<Idea, "prompt" | "projectId" | "providerId">): Promise<Idea> {
    const idea: Idea = { ...input, id: randomUUID(), createdAt: Date.now(), threadId: null, startedAt: null };
    await writeIdeas([...(await readIdeas()), idea]);
    return idea;
  }

  async function removeIdea(id: string): Promise<void> {
    await writeIdeas((await readIdeas()).filter((idea) => idea.id !== id));
  }

  async function startIdea(id: string): Promise<Idea> {
    const ideas = await readIdeas();
    const idea = ideas.find((candidate) => candidate.id === id);
    if (idea === undefined) throw new Error(`No idea with id ${id}.`);
    if (idea.threadId !== null) return idea;
    const thread = await bb.sdk.threads.spawn({
      projectId: idea.projectId,
      environment: { type: "project-default" },
      providerId: idea.providerId,
      prompt: idea.prompt,
      pluginMetadata: { idea: idea.id },
    });
    const started = { ...idea, threadId: thread.id, startedAt: Date.now() };
    await writeIdeas((await readIdeas()).map((candidate) => (candidate.id === id ? started : candidate)));
    return started;
  }

  async function runningCount(ideas: Idea[]): Promise<number> {
    const statuses = await Promise.all(
      ideas
        .filter((idea) => idea.threadId !== null)
        .map((idea) =>
          bb.sdk.threads
            .get({ threadId: idea.threadId! })
            .then((thread) => RUNNING_STATUSES.has(thread.status))
            .catch(() => false),
        ),
    );
    return statuses.filter(Boolean).length;
  }

  async function startDueIdeas(): Promise<Idea[]> {
    const ideas = await readIdeas();
    const queued = ideas.filter((idea) => idea.threadId === null);
    if (queued.length === 0) return [];
    const { maxRunning } = await settings.get();
    let slots = maxRunning - (await runningCount(ideas));
    if (slots <= 0) return [];
    const open = new Set((await forecasts()).filter((forecast) => forecast.startsIdeas).map((forecast) => forecast.providerId));
    const started: Idea[] = [];
    for (const idea of queued) {
      if (slots <= 0) break;
      if (!open.has(idea.providerId)) continue;
      started.push(await startIdea(idea.id));
      slots -= 1;
    }
    return started;
  }

  async function placeBelowAssistant(): Promise<void> {
    if (await bb.storage.kv.get<boolean>(PLACED_KEY)) return;
    const preferences = await bb.sdk.system.uiPreferences.list();
    const order = preferences.preferences["sidebar.pluginPanelOrder"];
    const rest = order.value.filter((key) => key !== PANEL_KEY);
    const at = rest.indexOf(ASSISTANT_PANEL_KEY) + 1;
    await bb.sdk.system.uiPreferences.set({
      key: "sidebar.pluginPanelOrder",
      expectedRevision: order.revision,
      value: [...rest.slice(0, at), PANEL_KEY, ...rest.slice(at)],
    });
    const visible = preferences.preferences["sidebar.visiblePluginPanels"];
    if (visible.value !== null && !visible.value.includes(PANEL_KEY)) {
      await bb.sdk.system.uiPreferences.set({
        key: "sidebar.visiblePluginPanels",
        expectedRevision: visible.revision,
        value: [...visible.value, PANEL_KEY],
      });
    }
    await bb.storage.kv.set(PLACED_KEY, true);
  }

  bb.events.on("thread.idle", async ({ thread }) => {
    if ((await readIdeas()).some((idea) => idea.threadId === thread.id)) bb.rpc.experimental_invalidate(["state"]);
  });

  bb.rpc.register(ideasRpcContract, {
    async "ideas.state"() {
      const [ideas, forecastList, projects, providers, current] = await Promise.all([
        readIdeas(),
        forecasts().catch((error: unknown) => {
          bb.log.warn(`could not read usage limits: ${String(error)}`);
          return [];
        }),
        bb.sdk.projects.list(),
        bb.sdk.providers.list(),
        settings.get(),
      ]);
      return {
        ideas,
        forecasts: forecastList,
        projects: projects.map((project) => ({ id: project.id, name: project.name })),
        providers: providers.map((provider) => ({ id: provider.id, name: provider.displayName })),
        startWithinHours: current.startWithinHours,
        targetPercent: current.targetPercent,
      };
    },
    "ideas.add": addIdea,
    async "ideas.remove"({ id }) {
      await removeIdea(id);
      return { ok: true as const };
    },
    async "ideas.start"({ id }) {
      return startIdea(id);
    },
  });

  bb.background.schedule("start-due-ideas", "*/10 * * * *", async () => {
    const started = await startDueIdeas();
    if (started.length > 0) bb.log.info(`started ${started.length} ideas before the weekly reset`);
  });

  await placeBelowAssistant().catch((error: unknown) => {
    bb.log.warn(`could not place Ideas below Assistant: ${String(error)}`);
  });

  bb.cli.register(
    defineCli({
      name: "ideas",
      summary: "Queue prompts that start before the weekly usage limit resets",
      commands: {
        forecast: cliCommand({
          summary: "Print each provider's weekly usage, projected usage at reset, and whether ideas start now",
          async run() {
            return { exitCode: 0, stdout: JSON.stringify(await forecasts(), null, 2) };
          },
        }),
        list: cliCommand({
          summary: "Print queued and started ideas",
          async run() {
            return { exitCode: 0, stdout: JSON.stringify(await readIdeas(), null, 2) };
          },
        }),
        add: cliCommand({
          summary: "Queue a prompt to start before the weekly reset",
          options: {
            project: { type: "string", description: "Project id the thread starts in", required: true },
            provider: { type: "string", description: "Provider id whose weekly limit it spends, such as claude-code or codex", required: true },
            prompt: { type: "string", description: "The prompt the thread starts with", required: true },
          },
          async run({ options }) {
            const idea = await addIdea({ projectId: options.project, providerId: options.provider, prompt: options.prompt });
            return { exitCode: 0, stdout: idea.id };
          },
        }),
        remove: cliCommand({
          summary: "Delete an idea",
          positionals: [{ name: "id", description: "Idea id from `bb ideas list`", required: true }],
          async run({ positionals }) {
            await removeIdea(String(positionals.id));
            return { exitCode: 0, stdout: "Removed." };
          },
        }),
        start: cliCommand({
          summary: "Start one idea now, ignoring the forecast",
          positionals: [{ name: "id", description: "Idea id from `bb ideas list`", required: true }],
          async run({ positionals }) {
            const idea = await startIdea(String(positionals.id));
            return { exitCode: 0, stdout: idea.threadId ?? "" };
          },
        }),
        run: cliCommand({
          summary: "Start the queued ideas the forecast allows now, without waiting for the 10 minute check",
          async run() {
            const started = await startDueIdeas();
            return { exitCode: 0, stdout: started.map((idea) => `${idea.id} ${idea.threadId}`).join("\n") || "Nothing to start." };
          },
        }),
      },
    }),
  );
}
