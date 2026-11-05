import { Navigate } from "react-router-dom";
import { PluginSlotMount } from "@/components/plugin/PluginSlotMount";
import { usePluginFrontendsSettled } from "@/lib/plugin-frontend-boot-state";
import { usePinnedTabPanel } from "@/lib/pinned-tab";
import { APP_ROOT_ROUTE_PATH } from "@/lib/route-paths";
import { SplitTabBar } from "./thread-detail/SplitTabBar";

export default function PinnedTabView() {
  const panel = usePinnedTabPanel();
  const pluginsSettled = usePluginFrontendsSettled();
  if (panel === null && pluginsSettled)
    return <Navigate to={APP_ROOT_ROUTE_PATH} replace />;
  return (
    <>
      <SplitTabBar />
      {panel === null ? null : (
        <PluginSlotMount
          key={`${panel.pluginId}/${panel.id}/${panel.generation}`}
          pluginId={panel.pluginId}
          slotKind="navPanel"
          slotId={panel.id}
        >
          <panel.component subPath="" />
        </PluginSlotMount>
      )}
    </>
  );
}
