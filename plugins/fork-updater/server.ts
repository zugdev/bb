import { cliCommand, defineCli, PluginCliError, type BbPluginApi } from "@get-bb/plugin-sdk";
import { classifyChanges } from "./classify.js";
import {
  forkUpdaterHostContract,
  forkUpdaterRpcContract,
  type ForkUpdaterStatus,
  type UpdateStep,
} from "./contract.js";

const BUILT_COMMIT_KEY = "built-commit";
const SEED_BUILT_COMMIT = "5008564189";
const DEFAULT_CHECKOUT = "/Users/gus/prog/bb/.claude/worktrees/trunk";
const LONG_STEP_TIMEOUT_MS = 30 * 60_000;

const JSON_OPTION = { type: "boolean", description: "Emit machine-readable JSON" } as const;

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function formatStatus(status: ForkUpdaterStatus): string {
  const lines = [`Installed build: ${status.builtCommit}`, `origin/main: ${status.remoteCommit ?? "unknown"}`];
  if (status.kind === "up-to-date") lines.push("Up to date");
  else if (status.kind === "plugins")
    lines.push(`${status.commits.length} pending commits, plugin reload only: ${status.reloadPluginIds.join(", ")}`);
  else lines.push(`${status.commits.length} pending commits, needs an app rebuild and restart`);
  for (const commit of status.commits) lines.push(`  ${commit.sha} ${commit.subject}`);
  if (status.progress !== null) lines.push(`In progress: ${status.progress}`);
  if (status.error !== null) lines.push(`Error: ${status.error}`);
  return lines.join("\n");
}

export default async function forkUpdaterPlugin(bb: BbPluginApi): Promise<void> {
  const settings = bb.settings.define({
    checkoutPath: {
      type: "string",
      label: "Checkout path",
      description: "A clean checkout of main on zugdev/bb that the updater fetches, builds and installs from.",
      default: DEFAULT_CHECKOUT,
    },
  });
  const host = bb.hosts.experimental_client({ contract: forkUpdaterHostContract });

  let builtCommit = (await bb.storage.kv.get<string>(BUILT_COMMIT_KEY)) ?? SEED_BUILT_COMMIT;
  await bb.storage.kv.set(BUILT_COMMIT_KEY, builtCommit);
  let status: ForkUpdaterStatus = {
    checkoutPath: DEFAULT_CHECKOUT,
    builtCommit,
    remoteCommit: null,
    commits: [],
    kind: "up-to-date",
    reloadPluginIds: [],
    checkedAt: null,
    progress: null,
    error: null,
  };
  let checking: Promise<ForkUpdaterStatus> | null = null;
  let updating: Promise<ForkUpdaterStatus> | null = null;

  function setStatus(patch: Partial<ForkUpdaterStatus>): void {
    status = { ...status, ...patch };
    bb.rpc.experimental_invalidateAll();
  }

  async function checkoutPath(): Promise<string> {
    const value = (await settings.get()).checkoutPath;
    return typeof value === "string" && value !== "" ? value : DEFAULT_CHECKOUT;
  }

  async function serverHostId(): Promise<string> {
    const { primaryHostId } = await bb.sdk.system.config();
    if (primaryHostId === null) throw new Error("This bb server has no host daemon of its own");
    return primaryHostId;
  }

  async function localPlugins() {
    const { plugins } = await bb.sdk.plugins.list();
    return plugins
      .filter((plugin) => plugin.source.startsWith("path:"))
      .map((plugin) => ({ id: plugin.id, rootDir: plugin.rootDir }));
  }

  async function runStep(step: UpdateStep, path: string): Promise<string> {
    const { headCommit } = await host.call(
      "run",
      { checkoutPath: path, step },
      { hostId: await serverHostId(), timeoutMs: LONG_STEP_TIMEOUT_MS },
    );
    return headCommit;
  }

  async function inspect(): Promise<ForkUpdaterStatus> {
    const path = await checkoutPath();
    try {
      const result = await host.call(
        "inspect",
        { checkoutPath: path, builtCommit },
        { hostId: await serverHostId(), timeoutMs: 5 * 60_000 },
      );
      const classified = result.builtIsAncestor
        ? classifyChanges(path, result.changedFiles, await localPlugins())
        : ({ kind: "rebuild" } as const);
      setStatus({
        checkoutPath: path,
        builtCommit,
        remoteCommit: result.remoteCommit,
        commits: result.commits,
        kind: classified.kind,
        reloadPluginIds: classified.kind === "plugins" ? classified.pluginIds : [],
        checkedAt: Date.now(),
        error: null,
      });
    } catch (error) {
      setStatus({ checkoutPath: path, checkedAt: Date.now(), error: errorMessage(error) });
    }
    return status;
  }

  function check(): Promise<ForkUpdaterStatus> {
    if (updating !== null) return Promise.resolve(status);
    checking ??= inspect().finally(() => {
      checking = null;
    });
    return checking;
  }

  async function saveBuiltCommit(commit: string): Promise<void> {
    builtCommit = commit;
    await bb.storage.kv.set(BUILT_COMMIT_KEY, commit);
  }

  async function applyUpdate(): Promise<ForkUpdaterStatus> {
    const current = await check();
    if (current.error !== null) throw new Error(current.error);
    if (current.kind === "up-to-date") return current;
    const path = current.checkoutPath;
    try {
      setStatus({ progress: "Fast forwarding the checkout to origin/main", error: null });
      const head = await runStep("fast-forward", path);
      if (current.kind === "plugins") {
        for (const pluginId of current.reloadPluginIds) {
          setStatus({ progress: `Reloading ${pluginId}` });
          if (pluginId !== bb.pluginId) await bb.sdk.plugins.reload({ pluginId });
        }
        await saveBuiltCommit(head);
        setStatus({ progress: null, builtCommit: head });
        if (current.reloadPluginIds.includes(bb.pluginId)) {
          void bb.sdk.plugins.reload({ pluginId: bb.pluginId });
        }
        return status;
      }
      setStatus({ progress: "Installing dependencies" });
      await runStep("install", path);
      setStatus({ progress: "Packaging bb.app, this takes several minutes" });
      await runStep("package", path);
      await saveBuiltCommit(head);
      setStatus({ progress: "Restarting bb with the new build", builtCommit: head });
      await runStep("swap", path);
      return status;
    } catch (error) {
      setStatus({ progress: null, error: errorMessage(error) });
      throw error;
    }
  }

  function update(): Promise<ForkUpdaterStatus> {
    updating ??= applyUpdate()
      .finally(() => {
        updating = null;
      })
      .then(() => check());
    return updating;
  }

  bb.rpc.register(forkUpdaterRpcContract, {
    status: ({ refresh }) => (refresh || status.checkedAt === null ? check() : status),
    update: () => {
      void update().catch(() => undefined);
      return status;
    },
  });

  bb.cli.register(
    defineCli({
      name: "fork-updater",
      summary: "Check whether bb is behind main of zugdev/bb and update it",
      description:
        "Compares the commit the installed bb was built from with origin/main in the configured checkout. A plugin only update reloads the changed plugins; anything else rebuilds and reinstalls /Applications/bb.app, which restarts bb.",
      commands: {
        status: cliCommand({
          summary: "Fetch origin and show pending commits",
          options: { json: JSON_OPTION },
          async run(input) {
            const result = await check();
            return { exitCode: 0, stdout: input.options.json ? JSON.stringify(result) : formatStatus(result) };
          },
        }),
        update: cliCommand({
          summary: "Apply pending commits: reload plugins, or rebuild and restart bb",
          options: { json: JSON_OPTION },
          async run(input) {
            try {
              const result = await update();
              return { exitCode: 0, stdout: input.options.json ? JSON.stringify(result) : formatStatus(result) };
            } catch (error) {
              throw new PluginCliError(errorMessage(error), { code: "update_failed" });
            }
          },
        }),
      },
    }),
  );

  bb.background.schedule("check", "*/5 * * * *", async () => {
    await check();
  });
}
