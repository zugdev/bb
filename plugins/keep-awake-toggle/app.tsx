import { useEffect } from "react";
import { defineRpcContract } from "@get-bb/plugin-sdk";
import {
  definePluginApp,
  experimental_usePluginId,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
} from "@get-bb/plugin-sdk/app";
import { z } from "zod";

const KEEP_AWAKE_PLUGIN_ID = "keep-awake";
const FOOTER_ITEM_ID = "toggle";

const configurationSchema = z.object({
  enabled: z.boolean(),
  selection: z.discriminatedUnion("mode", [
    z.object({ mode: z.literal("all") }),
    z.object({ mode: z.literal("selected"), hostIds: z.array(z.string()) }),
  ]),
});

const keepAwakeRpcContract = defineRpcContract({
  getConfiguration: { input: z.null(), output: configurationSchema },
  setConfiguration: { input: configurationSchema, output: configurationSchema },
});

let toggleKeepAwake: (() => void) | null = null;

function footerCss(pluginId: string, enabled: boolean): string {
  if (!enabled) return "";
  const button = `[data-testid="plugin-sidebar-footer-item-${pluginId}-${FOOTER_ITEM_ID}"]`;
  return `${button} { color: var(--warning); }
${button} [data-icon-root] { opacity: 1; }`;
}

function KeepAwakeController() {
  const pluginId = experimental_usePluginId();
  const { data, refetch } = experimental_useRpcQuery({
    contract: keepAwakeRpcContract,
    pluginId: KEEP_AWAKE_PLUGIN_ID,
    method: "getConfiguration",
    input: null,
  });
  const { mutate } = experimental_useRpcMutation({
    contract: keepAwakeRpcContract,
    pluginId: KEEP_AWAKE_PLUGIN_ID,
    method: "setConfiguration",
  });

  useEffect(() => {
    if (data === undefined) return;
    toggleKeepAwake = () => {
      void mutate({ enabled: !data.enabled, selection: data.selection })
        .then(refetch)
        .catch(() => undefined);
    };
    return () => {
      toggleKeepAwake = null;
    };
  }, [data, mutate, refetch]);

  return <style>{footerCss(pluginId, data?.enabled === true)}</style>;
}

export default definePluginApp((app) => {
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: FOOTER_ITEM_ID,
    label: "Keep awake",
    icon: "Coffee",
    onActivate: () => toggleKeepAwake?.(),
  });
  app.slots.experimental_appOverlay({
    id: "keep-awake-controller",
    component: KeepAwakeController,
  });
});
