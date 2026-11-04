import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import { describe, expect, it, vi } from "vitest";
import plugin from "./server.js";

const CHECKOUT = "/Users/gus/prog/bb/.claude/worktrees/trunk";

interface SwapReport {
  installedCommit: string | null;
  swapError: string | null;
}

function setup(changedFiles: string[], failStep: string | null = null) {
  const report: SwapReport = { installedCommit: null, swapError: null };
  const steps: string[] = [];
  const reload = vi.fn(async () => ({}));
  const host = createFakePluginHost({
    pluginId: "fork-updater",
    sdk: {
      system: { config: async () => ({ primaryHostId: "host-1" }) },
      plugins: {
        list: async () => ({
          plugins: [
            { id: "assistant", source: `path:${CHECKOUT}/plugins/assistant`, rootDir: `${CHECKOUT}/plugins/assistant` },
          ],
        }),
        reload,
      },
    },
    experimental_callHostRpc: async ({ method, input }) => {
      if (method === "inspect") {
        return {
          remoteCommit: "bbbbbbb",
          builtIsAncestor: true,
          commits: [{ sha: "bbbbbbb", subject: "Change things" }],
          changedFiles,
          ...report,
        };
      }
      const step = String(Reflect.get(input as object, "step"));
      steps.push(step);
      if (step === failStep) throw new Error(`${CHECKOUT} has uncommitted changes:\n M README.md`);
      return { headCommit: "bbbbbbb" };
    },
  });
  return { host, steps, reload, report };
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

  it("swaps without reopening when asked", async () => {
    const { host, steps } = setup(["pnpm-lock.yaml"]);
    await plugin(host.bb);
    await host.harness.runCli(["update", "--no-reopen"]);
    expect(steps).toEqual(["fast-forward", "install", "package", "swap"]);
  });

  it("keeps showing a failed swap until the next update starts", async () => {
    const { host, steps, report } = setup(["pnpm-lock.yaml"]);
    await plugin(host.bb);
    report.swapError = "the new bb.app did not start after the swap";
    await host.harness.callRpc("status", { refresh: true });
    report.swapError = null;
    const status = await host.harness.callRpc("status", { refresh: true });
    expect(status).toMatchObject({ kind: "rebuild", progress: null, error: expect.stringContaining("did not start") });

    await host.harness.callRpc("update", { reopen: true });
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
});
