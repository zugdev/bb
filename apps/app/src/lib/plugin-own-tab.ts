import { useCallback, useMemo } from "react";
import { useAtomValue, useStore } from "jotai";
import { useNavigate } from "react-router-dom";
import type {
  ExperimentalOwnTab,
  ExperimentalOwnTabPane,
  ExperimentalOwnTabTarget,
} from "@get-bb/plugin-sdk";
import { isPromptDraftEmpty } from "@bb/client-core";
import { usePluginId } from "@/components/plugin/plugin-context";
import { getPromptDraftAccessor } from "@/hooks/usePromptDraftStorage";
import { findPane, type PaneContent } from "@/lib/split-layout";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import {
  composerDraftScope,
  splitTabsAtom,
  type SplitTabOwner,
} from "@/lib/split-layout/tabs";
import { showInOwnedTab } from "@/views/thread-detail/splitThreadNavigation";

const NEW_THREAD_PANE = {
  paneId: "pane-1",
  content: { kind: "new-thread" },
} as const;

function targetContent(target: ExperimentalOwnTabTarget): PaneContent {
  return target.kind === "thread"
    ? {
        kind: "thread",
        projectId: target.projectId,
        threadId: target.threadId,
      }
    : { kind: "new-thread" };
}

export function useOwnTab(panelPath: string): ExperimentalOwnTab {
  const pluginId = usePluginId();
  const store = useStore();
  const navigate = useNavigate();
  const tabs = useAtomValue(splitTabsAtom);
  const layout = useAtomValue(splitLayoutAtom);
  const active = tabs.tabs.find((tab) => tab.id === tabs.activeTabId);
  const isActive =
    active?.panel?.pluginId === pluginId &&
    active.panel.panelPath === panelPath;
  const pane = !isActive
    ? null
    : layout === null
      ? NEW_THREAD_PANE
      : findPane(layout.root, layout.focusedPaneId);
  const focused = useMemo((): ExperimentalOwnTabPane | null => {
    if (pane === null) return null;
    const { paneId, content } = pane;
    if (content.kind === "thread") {
      return {
        kind: "thread",
        paneId,
        projectId: content.projectId,
        threadId: content.threadId,
      };
    }
    if (content.kind === "new-thread") {
      return {
        kind: "compose",
        paneId,
        hasDraft: () =>
          !isPromptDraftEmpty(
            getPromptDraftAccessor(
              composerDraftScope(
                store.get(splitLayoutAtom),
                store.get(splitTabsAtom),
                paneId,
              ),
            ).getCurrent(),
          ),
      };
    }
    return { kind: "other", paneId };
  }, [pane, store]);
  const show = useCallback(
    (target: ExperimentalOwnTabTarget) => {
      const owner: SplitTabOwner = {
        kind: "panel",
        panel: { pluginId, panelPath },
      };
      showInOwnedTab(
        store,
        (route, options) => void navigate(route, options),
        owner,
        targetContent(target),
      );
    },
    [navigate, panelPath, pluginId, store],
  );
  return useMemo(
    () => ({ isActive, focused, show }),
    [focused, isActive, show],
  );
}
