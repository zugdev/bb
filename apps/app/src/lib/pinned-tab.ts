import { useEffect } from "react";
import { useSetAtom } from "jotai";
import { usePluginSlots, type PluginNavPanelSlot } from "@/lib/plugin-slots";
import { setPermanentTabPanelAtom } from "@/lib/split-layout/tabs";

export function pinnedTabPanel(
  navPanels: readonly PluginNavPanelSlot[],
): PluginNavPanelSlot | null {
  return navPanels.find((panel) => panel.experimental_pinnedTab === true) ?? null;
}

export function usePinnedTabPanel(): PluginNavPanelSlot | null {
  return pinnedTabPanel(usePluginSlots().navPanels);
}

export function permanentTabPanel(
  navPanels: readonly PluginNavPanelSlot[],
): PluginNavPanelSlot | null {
  return (
    navPanels.find((panel) => panel.experimental_permanentTab === true) ?? null
  );
}

export function usePermanentTabPanel(): PluginNavPanelSlot | null {
  return permanentTabPanel(usePluginSlots().navPanels);
}

export function useKeepPermanentTab(): void {
  const panel = usePermanentTabPanel();
  const setPermanentTabPanel = useSetAtom(setPermanentTabPanelAtom);
  const pluginId = panel?.pluginId ?? null;
  const panelPath = panel?.path ?? null;
  useEffect(() => {
    setPermanentTabPanel(
      pluginId === null || panelPath === null ? null : { pluginId, panelPath },
    );
  }, [panelPath, pluginId, setPermanentTabPanel]);
}
