import { usePluginSlots, type PluginNavPanelSlot } from "@/lib/plugin-slots";

export function pinnedTabPanel(
  navPanels: readonly PluginNavPanelSlot[],
): PluginNavPanelSlot | null {
  return navPanels.find((panel) => panel.experimental_pinnedTab === true) ?? null;
}

export function usePinnedTabPanel(): PluginNavPanelSlot | null {
  return pinnedTabPanel(usePluginSlots().navPanels);
}
