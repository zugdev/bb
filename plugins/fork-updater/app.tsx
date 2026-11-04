import {
  definePluginApp,
  experimental_useRpcMutation,
  experimental_useRpcQuery,
  experimental_usePluginId,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import { forkUpdaterRpcContract, type ForkUpdaterStatus } from "./contract.js";

export const FOOTER_ITEM_ID = "update";

export function footerCss(pluginId: string, status: ForkUpdaterStatus | undefined): string {
  const button = `[data-testid="plugin-sidebar-footer-item-${pluginId}-${FOOTER_ITEM_ID}"]`;
  if (status === undefined || (status.kind === "up-to-date" && status.error === null)) {
    return `[data-footer-item]:has(${button}) { display: none; }`;
  }
  const label = status.error !== null ? "!" : status.commits.length > 0 ? String(status.commits.length) : "";
  return `${button} { position: relative; }
${button}::after {
  content: ${JSON.stringify(label)};
  position: absolute; top: 1px; right: 1px;
  min-width: 14px; height: 14px; padding: 0 3px; box-sizing: border-box;
  border-radius: 7px; font-size: 9px; line-height: 14px; text-align: center; font-weight: 600;
  background: var(${status.error !== null ? "--destructive" : "--primary"});
  color: var(${status.error !== null ? "--destructive-foreground" : "--primary-foreground"});
}`;
}

function useStatus() {
  return experimental_useRpcQuery({
    contract: forkUpdaterRpcContract,
    method: "status",
    input: { refresh: false },
  });
}

function FooterStyle() {
  const pluginId = experimental_usePluginId();
  const { data } = useStatus();
  return <style>{footerCss(pluginId, data)}</style>;
}

export function UpdatePanel() {
  const { data, error } = useStatus();
  const update = experimental_useRpcMutation({ contract: forkUpdaterRpcContract, method: "update" });
  if (data === undefined) {
    return <p className="p-3 text-xs text-muted-foreground">{error?.message ?? "Checking for updates"}</p>;
  }
  const busy = data.progress !== null || update.isPending;
  const failure = data.error ?? update.error?.message ?? null;
  return (
    <div className="flex flex-col gap-2 p-3 text-xs">
      <div className="font-medium text-sidebar-foreground">
        {data.kind === "up-to-date"
          ? "bb is up to date"
          : `${data.commits.length} ${data.commits.length === 1 ? "commit" : "commits"} behind main`}
      </div>
      {data.kind === "up-to-date" ? null : (
        <div className="text-muted-foreground">
          {data.kind === "plugins"
            ? `Reloads ${data.reloadPluginIds.join(", ")}, no restart`
            : "Rebuilds bb.app and restarts bb"}
        </div>
      )}
      {data.commits.length === 0 ? null : (
        <ul className="flex max-h-40 flex-col gap-1 overflow-auto">
          {data.commits.map((commit) => (
            <li key={commit.sha} className="flex gap-2">
              <span className="shrink-0 font-mono text-muted-foreground">{commit.sha}</span>
              <span className="min-w-0 truncate" title={commit.subject}>
                {commit.subject}
              </span>
            </li>
          ))}
        </ul>
      )}
      {data.progress === null ? null : <div className="text-muted-foreground">{data.progress}…</div>}
      {failure === null ? null : (
        <pre className="max-h-32 overflow-auto whitespace-pre-wrap text-destructive">{failure}</pre>
      )}
      {data.kind === "up-to-date" ? null : (
        <Button size="sm" disabled={busy} onClick={() => void update.mutate({}).catch(() => undefined)}>
          {busy ? "Updating" : "Update"}
        </Button>
      )}
    </div>
  );
}

export default definePluginApp((app) => {
  app.experimental_sidebarFooter.register({
    kind: "disclosure",
    id: FOOTER_ITEM_ID,
    label: "Update bb",
    icon: "Download",
    component: UpdatePanel,
  });
  app.slots.experimental_appOverlay({ id: "footer-style", component: FooterStyle });
});
