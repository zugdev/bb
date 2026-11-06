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
import type { PluginThreadActionTarget } from "@get-bb/plugin-sdk";
import {
  CORE_THREAD_ACTION_OWNER,
  useThreadActionEntries,
} from "@/lib/thread-actions/thread-action-registry";

type Store = ReturnType<typeof useStore>;

function showInFocusTab(
  store: Store,
  navigate: (route: string, options: { replace: true }) => void,
  content: PaneContent,
) {
  const current = store.get(splitLayoutAtom);
  if (current !== null) {
    store.set(
      splitLayoutAtom,
      replacePaneContent(current, current.focusedPaneId, content),
    );
  }
  navigate(paneContentRoute(content), { replace: true });
}

function useIsFocusTabActive(): boolean {
  const { tabs, activeTabId } = useAtomValue(splitTabsAtom);
  return tabs.find((tab) => tab.id === activeTabId)?.kind === "focus";
}

const FOCUS_ARCHIVE_ACTION_KEYS = [`${CORE_THREAD_ACTION_OWNER}/archive`];

export function FocusTabNavigator({
  thread,
}: {
  thread: PluginThreadActionTarget;
}) {
  return useIsFocusTabActive() ? (
    <FocusTabNavigatorBar thread={thread} />
  ) : null;
}

function FocusTabNavigatorBar({
  thread,
}: {
  thread: PluginThreadActionTarget;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const entries = useThreadEntriesById();
  const queue = useMemo(() => focusQueue(entries.values()), [entries]);
  const [archive] = useThreadActionEntries(thread, {
    keys: FOCUS_ARCHIVE_ACTION_KEYS,
  });
  const index = queue.findIndex((entry) => entry.id === thread.id);
  if (queue.length === 0) return null;
  const go = (step: -1 | 1) => {
    const target =
      index === -1
        ? queue.at(step === 1 ? 0 : -1)
        : queue[(index + step + queue.length) % queue.length];
    if (target === undefined || target.id === thread.id) return;
    showInFocusTab(store, navigate, {
      kind: "thread",
      projectId: target.projectId,
      threadId: target.id,
    });
  };
  return (
    <div
      data-focus-tab-navigator=""
      className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 text-xs"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Previous thread in Focus"
        disabled={queue.length < 2}
        onClick={() => go(-1)}
      >
        <Icon name="ChevronLeft" />
      </Button>
      <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
        <Icon name="Target" className="size-3.5 text-primary" />
        Focus {index === -1 ? "–" : index + 1}/{queue.length}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Next thread in Focus"
        disabled={queue.length < 2 && index !== -1}
        onClick={() => go(1)}
      >
        <Icon name="ChevronRight" />
      </Button>
      {archive === undefined || thread.archivedAt !== null ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 px-2 text-xs"
          disabled={archive.action.disabled}
          onClick={() => void archive.action.run()}
        >
          <Icon name="Archive" className="size-3.5" />
          Archive
        </Button>
      )}
    </div>
  );
}

export function useFocusQueueLength(): number {
  const entries = useThreadEntriesById();
  return useMemo(() => focusQueue(entries.values()).length, [entries]);
}

export function FocusTabButton() {
  const store = useStore();
  const navigate = useNavigate();
  const isFocusTab = useIsFocusTabActive();
  const count = useFocusQueueLength();
  if (isFocusTab) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className="-ml-2 h-7 gap-1.5 px-2 text-xs"
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
  const showsCompose =
    focused === null || focused.content.kind === "new-thread";

  useEffect(() => {
    if (!isLoaded || !isFocusTab) return;
    if (shownThreadId === null && !showsCompose) return;
    const queue = focusQueue(entries.values());
    const tracked = trackedByTab.current;
    const step = nextFocusStep(queue, shownThreadId, tracked.get(activeTabId));
    const show = (content: PaneContent, threadId: string | null) => {
      tracked.set(activeTabId, threadId);
      showInFocusTab(store, navigate, content);
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
