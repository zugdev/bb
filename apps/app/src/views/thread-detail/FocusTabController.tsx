import { useEffect, useMemo, useRef } from "react";
import { useAtomValue, useStore } from "jotai";
import { useNavigate } from "react-router-dom";
import { appToast } from "@/components/ui/app-toast";
import { useThreadEntriesById } from "@/components/thread/ThreadStatusDot";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { findPane, replacePaneContent } from "@/lib/split-layout";
import { splitTabsAtom } from "@/lib/split-layout/tabs";
import type { PaneContent } from "@/lib/split-layout";
import { focusQueue, nextFocusStep } from "./focus-queue";
import { openFocusTab, paneContentRoute } from "./splitThreadNavigation";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";

export function useFocusQueueLength(): number {
  const entries = useThreadEntriesById();
  return useMemo(() => focusQueue(entries.values()).length, [entries]);
}

export function FocusTabButton() {
  const store = useStore();
  const navigate = useNavigate();
  const { tabs, activeTabId } = useAtomValue(splitTabsAtom);
  const count = useFocusQueueLength();
  if (tabs.find((tab) => tab.id === activeTabId)?.kind === "focus") {
    return null;
  }
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="h-7 gap-1.5 px-2 text-xs"
      aria-label={`Focus on ${count} threads that need a reply`}
      onClick={() => openFocusTab(store, navigate)}
    >
      <Icon name="Target" className="size-3.5 text-primary" />
      Focus
      {count > 0 ? (
        <span className="text-muted-foreground tabular-nums">{count}</span>
      ) : null}
    </Button>
  );
}

export function FocusTabController() {
  const store = useStore();
  const navigate = useNavigate();
  const { tabs, activeTabId } = useAtomValue(splitTabsAtom);
  const layout = useAtomValue(splitLayoutAtom);
  const isLoaded = useSidebarNavigation().data !== undefined;
  const entries = useThreadEntriesById();
  const trackedByTab = useRef(new Map<string, string | null>());
  const isFocusTab =
    tabs.find((tab) => tab.id === activeTabId)?.kind === "focus";
  const focused =
    layout === null ? null : findPane(layout.root, layout.focusedPaneId);
  const shownThreadId =
    focused?.content.kind === "thread" ? focused.content.threadId : null;
  const showsCompose = focused === null || focused.content.kind === "new-thread";

  useEffect(() => {
    if (!isLoaded || !isFocusTab) return;
    if (shownThreadId === null && !showsCompose) return;
    const queue = focusQueue(entries.values());
    const tracked = trackedByTab.current;
    const step = nextFocusStep(queue, shownThreadId, tracked.get(activeTabId));
    const show = (content: PaneContent, threadId: string | null) => {
      tracked.set(activeTabId, threadId);
      const current = store.get(splitLayoutAtom);
      if (current !== null) {
        store.set(
          splitLayoutAtom,
          replacePaneContent(current, current.focusedPaneId, content),
        );
      }
      navigate(paneContentRoute(content), { replace: true });
    };
    if (step.kind === "stay") {
      if (queue.some((thread) => thread.id === shownThreadId)) {
        tracked.set(activeTabId, shownThreadId);
      }
      return;
    }
    if (step.kind === "done") {
      appToast.success("All caught up");
      show({ kind: "new-thread" }, null);
      return;
    }
    show(
      {
        kind: "thread",
        projectId: step.thread.projectId,
        threadId: step.thread.id,
      },
      step.thread.id,
    );
  }, [
    activeTabId,
    entries,
    isFocusTab,
    isLoaded,
    navigate,
    shownThreadId,
    showsCompose,
    store,
  ]);

  return null;
}
