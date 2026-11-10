import { useAtomValue } from "jotai";
import { splitTabsAtom, tabOwner, type SplitTabOwner } from "./tabs";

export function useActiveTabOwner(): SplitTabOwner | null {
  const { tabs, activeTabId } = useAtomValue(splitTabsAtom);
  const active = tabs.find((tab) => tab.id === activeTabId);
  return active === undefined ? null : tabOwner(active);
}
