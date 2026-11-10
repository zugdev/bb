import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAtomValue, useStore } from "jotai";
import { useNavigate } from "react-router-dom";
import type { ThreadListEntry } from "@bb/domain";
import { appToast } from "@/components/ui/app-toast";
import { useThreadEntriesById } from "@/components/thread/ThreadStatusDot";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { findPane, replacePaneContent } from "@/lib/split-layout";
import { splitTabsAtom } from "@/lib/split-layout/tabs";
import type { PaneContent } from "@/lib/split-layout";
import {
  inboxQueue,
  inboxSections,
  nextInboxStep,
  nextSnoozeWake,
  type InboxSections,
} from "./inbox-queue";
import { paneContentRoute } from "./splitThreadNavigation";
import { Button } from "@bb/shared-ui/button";
import { Icon } from "@bb/shared-ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bb/shared-ui/dropdown-menu";
import type { PluginThreadActionTarget } from "@get-bb/plugin-sdk";
import {
  CORE_THREAD_ACTION_OWNER,
  useThreadActionEntries,
} from "@/lib/thread-actions/thread-action-registry";

type Store = ReturnType<typeof useStore>;

const MAX_TIMEOUT_MS = 2_147_483_647;

export function showInInboxTab(
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

export function useIsInboxTabActive(): boolean {
  const { tabs, activeTabId } = useAtomValue(splitTabsAtom);
  return tabs.find((tab) => tab.id === activeTabId)?.kind === "inbox";
}

function useInboxNow(entries: ReadonlyMap<string, ThreadListEntry>): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const wake = nextSnoozeWake(entries.values(), Date.now());
    if (wake === null) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(wake - Date.now() + 1, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(timer);
  }, [entries, now]);
  return now;
}

export interface InboxState {
  sections: InboxSections;
  queue: ThreadListEntry[];
  now: number;
}

export function useInbox(): InboxState {
  const entries = useThreadEntriesById();
  const now = useInboxNow(entries);
  return useMemo(() => {
    const sections = inboxSections(entries.values(), now);
    return {
      sections,
      queue: inboxQueue(sections),
      now,
    };
  }, [entries, now]);
}

export function useInboxQueueLength(): number {
  return useInbox().queue.length;
}

const INBOX_ARCHIVE_ACTION_KEYS = [`${CORE_THREAD_ACTION_OWNER}/archive`];
const SNOOZE_ACTION_KEYS = [`${CORE_THREAD_ACTION_OWNER}/snooze`];

export function SnoozeMenu({
  thread,
  children,
}: {
  thread: PluginThreadActionTarget;
  children: ReactNode;
}) {
  const [snooze] = useThreadActionEntries(thread, { keys: SNOOZE_ACTION_KEYS });
  const choices = snooze?.action.choices;
  if (snooze === undefined || choices === undefined) return null;
  return (
    <DropdownMenu modal={false}>
      <DropdownMenuTrigger asChild>{children}</DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        {choices.items.map((choice) => (
          <DropdownMenuItem
            key={choice.id}
            onSelect={() => void snooze.action.run(choice.id)}
          >
            {choice.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function InboxNavigator({
  thread,
}: {
  thread: PluginThreadActionTarget;
}) {
  return useIsInboxTabActive() ? <InboxNavigatorBar thread={thread} /> : null;
}

function InboxNavigatorBar({ thread }: { thread: PluginThreadActionTarget }) {
  const store = useStore();
  const navigate = useNavigate();
  const { queue } = useInbox();
  const [archive] = useThreadActionEntries(thread, {
    keys: INBOX_ARCHIVE_ACTION_KEYS,
  });
  const index = queue.findIndex((entry) => entry.id === thread.id);
  if (queue.length === 0) return null;
  const go = (step: -1 | 1) => {
    const target =
      index === -1
        ? queue.at(step === 1 ? 0 : -1)
        : queue[(index + step + queue.length) % queue.length];
    if (target === undefined || target.id === thread.id) return;
    showInInboxTab(store, navigate, {
      kind: "thread",
      projectId: target.projectId,
      threadId: target.id,
    });
  };
  const isOpen = thread.archivedAt === null;
  return (
    <div
      data-inbox-navigator=""
      className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 text-xs"
    >
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Previous thread in Inbox"
        disabled={queue.length < 2}
        onClick={() => go(-1)}
      >
        <Icon name="ChevronLeft" />
      </Button>
      <span className="flex items-center gap-1.5 tabular-nums text-muted-foreground">
        <Icon name="Inbox" className="size-3.5 text-primary" />
        Inbox {index === -1 ? "–" : index + 1}/{queue.length}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="size-7"
        aria-label="Next thread in Inbox"
        disabled={queue.length < 2 && index !== -1}
        onClick={() => go(1)}
      >
        <Icon name="ChevronRight" />
      </Button>
      {isOpen ? (
        <SnoozeMenu thread={thread}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 gap-1.5 px-2 text-xs"
          >
            <Icon name="AlarmClock" className="size-3.5" />
            Snooze
          </Button>
        </SnoozeMenu>
      ) : null}
      {archive === undefined || !isOpen ? null : (
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

export function InboxTabController() {
  const store = useStore();
  const navigate = useNavigate();
  const { tabs, activeTabId } = useAtomValue(splitTabsAtom);
  const layout = useAtomValue(splitLayoutAtom);
  const isLoaded = useSidebarNavigation().data !== undefined;
  const { queue } = useInbox();
  const trackedByTab = useRef(new Map<string, string | null>());
  const isInboxTab =
    tabs.find((tab) => tab.id === activeTabId)?.kind === "inbox";
  const focused =
    layout === null ? null : findPane(layout.root, layout.focusedPaneId);
  const shownThreadId =
    focused?.content.kind === "thread" ? focused.content.threadId : null;
  const showsCompose =
    focused === null || focused.content.kind === "new-thread";

  useEffect(() => {
    if (!isLoaded || !isInboxTab) return;
    if (shownThreadId === null && !showsCompose) return;
    const tracked = trackedByTab.current;
    const step = nextInboxStep(queue, shownThreadId, tracked.get(activeTabId));
    const show = (content: PaneContent, threadId: string | null) => {
      tracked.set(activeTabId, threadId);
      showInInboxTab(store, navigate, content);
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
    isInboxTab,
    isLoaded,
    navigate,
    queue,
    shownThreadId,
    showsCompose,
    store,
  ]);

  return null;
}
