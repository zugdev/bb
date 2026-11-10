import { useAtomValue } from "jotai";
import { usePreferredReplacement } from "@/lib/plugin-replacement-preference";
import { createSyncedPreferenceAtom } from "@/lib/ui-preferences/synced-preference-atom";
import type { ResolvedReplacement } from "@/lib/plugin-slot-resolvers";
import { usePluginSlots, type PluginThreadListSlot } from "@/lib/plugin-slots";
import { useRememberSurfaceProvider } from "@/lib/plugin-surface-providers";

export const threadListProviderAtom = createSyncedPreferenceAtom(
  "sidebar.threadListProvider",
);

export function useThreadListReplacement(): ResolvedReplacement<PluginThreadListSlot> {
  const { threadLists } = usePluginSlots();
  const preference = useAtomValue(threadListProviderAtom);
  const resolved = usePreferredReplacement(threadLists, preference);
  useRememberSurfaceProvider(
    "thread-list",
    resolved.kind === "plugin" ? resolved.registration.pluginId : null,
  );
  return resolved;
}

export const BUNDLED_THREAD_LIST_PLUGIN_ID = "thread-list";

export function useShowsBundledThreadList(): boolean {
  const { threadLists } = usePluginSlots();
  const preference = useAtomValue(threadListProviderAtom);
  const resolved = usePreferredReplacement(threadLists, preference);
  return (
    resolved.kind === "plugin" &&
    resolved.registration.pluginId === BUNDLED_THREAD_LIST_PLUGIN_ID
  );
}
