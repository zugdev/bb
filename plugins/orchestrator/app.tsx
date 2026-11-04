import { definePluginApp, type PluginBrowserBbSdk, type BbNavigate } from "@get-bb/plugin-sdk/app";
import { z } from "zod";
import { orchestratorRpcContract, type OrchestratorScope } from "./contract.js";
import { collectPaneThreadIds } from "./scope.js";

const SPLIT_LAYOUT_STORAGE_KEY = "bb.splitLayout";

function openTabThreadIds(): string[] {
  const stored =
    window.sessionStorage.getItem(SPLIT_LAYOUT_STORAGE_KEY) ??
    window.localStorage.getItem(SPLIT_LAYOUT_STORAGE_KEY);
  if (stored === null) return [];
  try {
    return collectPaneThreadIds(JSON.parse(stored));
  } catch {
    return [];
  }
}

async function startOrchestrator(
  sdk: PluginBrowserBbSdk,
  navigate: BbNavigate,
  scope: OrchestratorScope,
): Promise<void> {
  const { threadId } = await sdk.plugins.callRpc({
    pluginId: "orchestrator",
    method: "orchestrator.start",
    input: scope,
    outputSchema: orchestratorRpcContract["orchestrator.start"].output,
  });
  navigate.toThread(threadId);
}

export default definePluginApp((app) => {
  app.slots.experimental_threadAction({
    id: "orchestrate-project",
    title: "Orchestrate project",
    icon: "Bot",
    group: "8_orchestrate",
    order: 1,
    item: ({ thread, sdk, navigate }) => ({
      label: "Orchestrate project",
      icon: "Bot",
      run: () => startOrchestrator(sdk, navigate, { kind: "project", projectId: thread.projectId }),
    }),
  });
  app.slots.experimental_threadAction({
    id: "orchestrate-tab",
    title: "Orchestrate tab",
    icon: "Bot",
    group: "8_orchestrate",
    order: 2,
    item: ({ thread, sdk, navigate }) => ({
      label: "Orchestrate tab",
      icon: "Bot",
      run: () => {
        const paneThreads = openTabThreadIds();
        const threadIds = z
          .array(z.string())
          .parse(paneThreads.includes(thread.id) ? paneThreads : [thread.id, ...paneThreads]);
        return startOrchestrator(sdk, navigate, { kind: "threads", threadIds });
      },
    }),
  });
});
