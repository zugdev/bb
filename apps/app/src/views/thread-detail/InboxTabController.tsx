import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useAtomValue, useStore } from "jotai";
import { useNavigate } from "react-router-dom";
import { PERSONAL_PROJECT_ID, type ThreadListEntry } from "@bb/domain";
import { cn } from "@bb/shared-ui/lib/utils";
import { projectColor } from "@/lib/project-color";
import { appToast } from "@/components/ui/app-toast";
import { useThreadEntriesById } from "@/components/thread/ThreadStatusDot";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import { findPane, replacePaneContent } from "@/lib/split-layout";
import { composerDraftScope, splitTabsAtom } from "@/lib/split-layout/tabs";
import { getPromptDraftAccessor } from "@/hooks/usePromptDraftStorage";
import { isPromptDraftEmpty } from "@bb/client-core";
import type { PaneContent } from "@/lib/split-layout";
import {
  inboxQueue,
  inboxSections,
  nextInboxStep,
  nextSnoozeWake,
  type InboxSections,
} from "./inbox-queue";
import { openInboxTab, paneContentRoute } from "./splitThreadNavigation";
import { useAppCommandHandler } from "@/components/commands/AppCommandProvider";
import { useUsesSwipeChrome } from "@/components/layout/useUsesSwipeChrome";
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

function useProjectName(projectId: string): string | null {
  const data = useSidebarNavigation().data;
  if (data === undefined) return null;
  if (projectId === PERSONAL_PROJECT_ID) return data.personalProject.name;
  return (
    data.projects.find((project) => project.id === projectId)?.name ?? null
  );
}

export function InboxProjectLabel({
  projectId,
  className,
  separator,
}: {
  projectId: string;
  className?: string;
  separator?: string;
}) {
  const name = useProjectName(projectId);
  if (name === null) return null;
  return (
    <>
      <span
        className={cn("truncate", className)}
        style={{ color: projectColor(projectId) }}
      >
        {name}
      </span>
      {separator === undefined ? null : (
        <span aria-hidden className="text-muted-foreground">
          {separator}
        </span>
      )}
    </>
  );
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

function useInboxNavigation(thread: PluginThreadActionTarget) {
  const store = useStore();
  const navigate = useNavigate();
  const { queue } = useInbox();
  const [archive] = useThreadActionEntries(thread, {
    keys: INBOX_ARCHIVE_ACTION_KEYS,
  });
  const index = queue.findIndex((entry) => entry.id === thread.id);
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
  return { queue, index, go, archive, isOpen: thread.archivedAt === null };
}

type InboxNavigation = ReturnType<typeof useInboxNavigation>;

function InboxPager({
  nav: { queue, index, go },
  buttonClassName,
}: {
  nav: InboxNavigation;
  buttonClassName: string;
}) {
  return (
    <>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={buttonClassName}
        aria-label="Previous thread in Inbox"
        disabled={queue.length < 2}
        onClick={() => go(-1)}
      >
        <Icon name="ChevronLeft" />
      </Button>
      <span className="flex items-center gap-1.5 whitespace-nowrap tabular-nums text-muted-foreground">
        <Icon name="Inbox" className="size-3.5 text-primary" />
        Inbox {index === -1 ? "–" : index + 1}/{queue.length}
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className={buttonClassName}
        aria-label="Next thread in Inbox"
        disabled={queue.length < 2 && index !== -1}
        onClick={() => go(1)}
      >
        <Icon name="ChevronRight" />
      </Button>
    </>
  );
}

function InboxActions({
  thread,
  nav: { archive, isOpen },
  buttonClassName,
  labelClassName,
}: {
  thread: PluginThreadActionTarget;
  nav: InboxNavigation;
  buttonClassName: string;
  labelClassName?: string;
}) {
  if (!isOpen) return null;
  return (
    <>
      <SnoozeMenu thread={thread}>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={buttonClassName}
        >
          <Icon name="AlarmClock" className="size-3.5" />
          <span className={labelClassName}>Snooze</span>
        </Button>
      </SnoozeMenu>
      {archive === undefined ? null : (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className={buttonClassName}
          disabled={archive.action.disabled}
          onClick={() => void archive.action.run()}
        >
          <Icon name="Archive" className="size-3.5" />
          <span className={labelClassName}>Archive</span>
        </Button>
      )}
    </>
  );
}

export function InboxNavigator({
  thread,
  className,
}: {
  thread: PluginThreadActionTarget;
  className: string;
}) {
  const nav = useInboxNavigation(thread);
  if (nav.queue.length === 0) return null;
  return (
    <div
      data-inbox-navigator=""
      className={cn("shrink-0 items-center gap-1 text-xs", className)}
    >
      <InboxPager nav={nav} buttonClassName="size-7" />
      <InboxActions
        thread={thread}
        nav={nav}
        buttonClassName="h-7 gap-1.5 px-2 text-xs"
      />
    </div>
  );
}

const INBOX_BUBBLE_CLASS =
  "pointer-events-auto flex h-11 items-center rounded-full border border-border/70 bg-surface-scrim/75 text-xs shadow-lg backdrop-blur-md";

function InboxFloatingBubbles({
  thread,
}: {
  thread: PluginThreadActionTarget;
}) {
  const nav = useInboxNavigation(thread);
  if (nav.queue.length === 0) return null;
  return (
    <div
      data-inbox-navigator=""
      data-inbox-floating=""
      className="pointer-events-none absolute inset-x-0 bottom-full z-10 flex items-end justify-between gap-2 pb-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
    >
      <div className={INBOX_BUBBLE_CLASS}>
        <InboxPager nav={nav} buttonClassName="size-11 rounded-full" />
      </div>
      {nav.isOpen ? (
        <div className={INBOX_BUBBLE_CLASS}>
          <InboxActions
            thread={thread}
            nav={nav}
            buttonClassName="size-11 rounded-full"
            labelClassName="sr-only"
          />
        </div>
      ) : null}
    </div>
  );
}

export function InboxFloatingNavigator({
  thread,
}: {
  thread: PluginThreadActionTarget;
}) {
  const isPhone = useUsesSwipeChrome();
  const isInboxTab = useIsInboxTabActive();
  if (!isPhone || !isInboxTab) return null;
  return <InboxFloatingBubbles thread={thread} />;
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

  useAppCommandHandler("splitTab.openInbox", () => {
    openInboxTab(store, navigate);
    const top = queue[0];
    if (top !== undefined) {
      showInInboxTab(store, navigate, {
        kind: "thread",
        projectId: top.projectId,
        threadId: top.id,
      });
    }
    return true;
  });

  useEffect(() => {
    if (!isLoaded || !isInboxTab) return;
    if (shownThreadId === null && !showsCompose) return;
    const tracked = trackedByTab.current;
    const composerHasDraft =
      focused !== null &&
      showsCompose &&
      !isPromptDraftEmpty(
        getPromptDraftAccessor(
          composerDraftScope(layout, store.get(splitTabsAtom), focused.paneId),
        ).getCurrent(),
      );
    const step = nextInboxStep(
      queue,
      shownThreadId,
      tracked.get(activeTabId),
      composerHasDraft,
    );
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
    focused,
    isInboxTab,
    isLoaded,
    layout,
    navigate,
    queue,
    shownThreadId,
    showsCompose,
    store,
  ]);

  return null;
}
