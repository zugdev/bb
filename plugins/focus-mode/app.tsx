import { useEffect } from "react";
import {
  definePluginApp,
  experimental_usePluginId,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
} from "@get-bb/plugin-sdk/app";
import { focusModeRpcContract } from "./contract.js";

const FOOTER_ITEM_ID = "toggle";

let toggleFocusMode: (() => void) | null = null;

function footerCss(pluginId: string, enabled: boolean): string {
  if (!enabled) return "";
  const button = `[data-testid="plugin-sidebar-footer-item-${pluginId}-${FOOTER_ITEM_ID}"]`;
  return `${button} { color: var(--warning); }
${button} [data-icon-root] { opacity: 1; }`;
}

function FocusModeController() {
  const pluginId = experimental_usePluginId();
  const { data, refetch } = experimental_useRpcQuery({
    contract: focusModeRpcContract,
    method: "status",
    input: null,
  });
  const { mutate } = experimental_useRpcMutation({ contract: focusModeRpcContract, method: "setEnabled" });

  useEffect(() => {
    if (data === undefined) return;
    toggleFocusMode = () => {
      void mutate({ enabled: !data.enabled })
        .then(refetch)
        .catch(() => undefined);
    };
    return () => {
      toggleFocusMode = null;
    };
  }, [data, mutate, refetch]);

  return <style>{footerCss(pluginId, data?.enabled === true)}</style>;
}

export default definePluginApp((app) => {
  app.experimental_sidebarFooter.register({
    kind: "action",
    id: FOOTER_ITEM_ID,
    label: "Focus mode",
    icon: "Target",
    onActivate: () => toggleFocusMode?.(),
  });
  app.slots.experimental_appOverlay({ id: "focus-mode-controller", component: FocusModeController });
});
