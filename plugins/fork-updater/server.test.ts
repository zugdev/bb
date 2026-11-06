import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "./server.js";

const CHECKOUT = "/Users/gus/prog/bb/.claude/worktrees/trunk";

interface SwapReport {
  installedCommit: string | null;
  swapError: string | null;
}

function setup(changedFiles: string[], failStep: string | null = null, forkPluginDirs: string[] = []) {
  const report: SwapReport = { installedCommit: null, swapError: null };
  const steps: string[] = [];
  const reload = vi.fn(async () => ({}));
  const install = vi.fn(async (args: { source: string }) => {
    steps.push(`install ${args.source}`);
    return {};
  });
  const host = createFakePluginHost({
    pluginId: "fork-updater",
    sdk: {
      system: { config: async () => ({ primaryHostId: "host-1" }) },
      plugins: {
        list: async () => ({
          plugins: [
            { id: "assistant", source: `path:${CHECKOUT}/plugins/assistant`, rootDir: `${CHECKOUT}/plugins/assistant` },
            { id: "fork-updater", source: `path:${CHECKOUT}/plugins/fork-updater`, rootDir: `${CHECKOUT}/plugins/fork-updater` },
            { id: "bb--git", source: "builtin:git", rootDir: "/Applications/bb.app/builtin-plugins/git" },
          ],
        }),
        reload,
        install,
      },
    },
    experimental_callHostRpc: async ({ method, input }) => {
      if (method === "inspect") {
        return {
          remoteCommit: "bbbbbbb",
          builtIsAncestor: true,
          commits: [{ sha: "bbbbbbb", subject: "Change things" }],
          changedFiles,
          forkPluginDirs,
          ...report,
        };
      }
      const step = String(Reflect.get(input as object, "step"));
      steps.push(step);
      if (step === failStep) throw new Error(`${CHECKOUT} has uncommitted changes:\n M README.md`);
      return { headCommit: "bbbbbbb" };
    },
  });
  return { host, steps, reload, install, report };
}

describe("fork updater", () => {
  it("seeds the built commit and reports pending commits", async () => {
    const { host } = setup(["apps/server/src/index.ts"]);
    await plugin(host.bb);
    const result = await host.harness.runCli(["status", "--json"]);
    expect(JSON.parse(result.stdout)).toMatchObject({
      builtCommit: "5008564189",
      kind: "rebuild",
      commits: [{ sha: "bbbbbbb", subject: "Change things" }],
    });
  });

  it("reloads plugins without rebuilding when only local plugin files changed", async () => {
    const { host, steps, reload } = setup(["plugins/assistant/app.tsx"]);
    await plugin(host.bb);
    await host.harness.runCli(["update"]);
    expect(steps).toEqual(["fast-forward"]);
    expect(reload).toHaveBeenCalledWith({ pluginId: "assistant" });
    expect(await host.bb.storage.kv.get("built-commit")).toBe("bbbbbbb");
  });

  it("returns up to date before reloading itself", async () => {
    vi.useFakeTimers();
    try {
      const { host, reload } = setup(["plugins/fork-updater/server.ts", "plugins/assistant/app.tsx"]);
      await plugin(host.bb);
      const result = await host.harness.runCli(["update", "--json"]);
      expect(JSON.parse(result.stdout)).toMatchObject({ builtCommit: "bbbbbbb", kind: "up-to-date", commits: [] });
      expect(reload.mock.calls).toEqual([[{ pluginId: "assistant" }]]);
      await vi.runAllTimersAsync();
      expect(reload.mock.calls).toEqual([[{ pluginId: "assistant" }], [{ pluginId: "fork-updater" }]]);
    } finally {
      vi.useRealTimers();
    }
  });

  it("fast forwards and reports up to date when only docs changed", async () => {
    const { host, steps, reload } = setup(["docs/fork-roadmap.md", "README.md", ".github/workflows/ci.yml"]);
    await plugin(host.bb);
    const result = await host.harness.runCli(["status", "--json"]);
    expect(JSON.parse(result.stdout)).toMatchObject({ builtCommit: "bbbbbbb", kind: "up-to-date", commits: [] });
    expect(steps).toEqual(["fast-forward"]);
    expect(reload).not.toHaveBeenCalled();
  });

  it("rebuilds and swaps without recording the commit until the swap reports it installed", async () => {
    const { host, steps, reload, report } = setup(["pnpm-lock.yaml"]);
    await plugin(host.bb);
    await host.harness.runCli(["update"]);
    expect(steps).toEqual(["fast-forward", "install", "package", "swap-and-reopen"]);
    expect(reload).not.toHaveBeenCalled();
    expect(await host.bb.storage.kv.get("built-commit")).toBe("5008564189");

    report.installedCommit = "bbbbbbb";
    await host.harness.callRpc("status", { refresh: true });
    expect(await host.bb.storage.kv.get("built-commit")).toBe("bbbbbbb");
  });

  it("keeps showing a failed swap until the next update starts", async () => {
    const { host, steps, report } = setup(["pnpm-lock.yaml"]);
    await plugin(host.bb);
    report.swapError = "the new bb.app did not start after the swap";
    await host.harness.callRpc("status", { refresh: true });
    report.swapError = null;
    const status = await host.harness.callRpc("status", { refresh: true });
    expect(status).toMatchObject({ kind: "rebuild", progress: null, error: expect.stringContaining("did not start") });

    await host.harness.callRpc("update", {});
    await vi.waitFor(() => expect(steps).toContain("swap-and-reopen"));
    expect(await host.harness.callRpc("status", { refresh: false })).toMatchObject({ error: null });
  });

  it("stops and reports the error when the checkout is dirty", async () => {
    const { host, steps } = setup(["pnpm-lock.yaml"], "fast-forward");
    await plugin(host.bb);
    const result = await host.harness.runCli(["update"]);
    expect(result.exitCode).toBe(1);
    expect(steps).toEqual(["fast-forward"]);
    expect(await host.bb.storage.kv.get("built-commit")).toBe("5008564189");
    const status = await host.harness.callRpc("status", { refresh: false });
    expect(status).toMatchObject({ progress: null, error: expect.stringContaining("uncommitted changes") });
  });

  it("reports allowlisted plugins that are not installed yet", async () => {
    const { host, install } = setup(["apps/server/src/index.ts"], null, ["assistant", "git", "home", "parent-link"]);
    await plugin(host.bb);
    const result = await host.harness.runCli(["status"]);
    expect(result.stdout).toContain("Installs 2 new plugins: home, parent-link");
    expect(install).not.toHaveBeenCalled();
  });

  it("installs a new plugin after the fast forward without rebuilding", async () => {
    const { host, steps, reload } = setup(["plugins/home/server.ts", "plugins/assistant/app.tsx"], null, ["assistant", "home"]);
    await plugin(host.bb);
    await host.harness.runCli(["update"]);
    expect(steps).toEqual(["fast-forward", `install path:${CHECKOUT}/plugins/home`]);
    expect(reload).toHaveBeenCalledWith({ pluginId: "assistant" });
  });

  it("offers an update when only an allowlisted plugin is missing", async () => {
    const { host, steps } = setup([], null, ["home"]);
    await plugin(host.bb);
    expect(await host.harness.callRpc("status", { refresh: true })).toMatchObject({
      kind: "plugins",
      installPluginDirs: ["home"],
    });
    await host.harness.runCli(["update"]);
    expect(steps).toEqual(["fast-forward", `install path:${CHECKOUT}/plugins/home`]);
  });

  it("installs new plugins only once the rebuilt app reports the swap", async () => {
    const { host, steps, report } = setup(["pnpm-lock.yaml", "plugins/home/server.ts"], null, ["home"]);
    await plugin(host.bb);
    await host.harness.runCli(["update"]);
    expect(steps).toEqual(["fast-forward", "install", "package", "swap-and-reopen"]);

    report.installedCommit = "bbbbbbb";
    await host.harness.callRpc("status", { refresh: true });
    expect(steps.at(-1)).toBe(`install path:${CHECKOUT}/plugins/home`);
  });
});
