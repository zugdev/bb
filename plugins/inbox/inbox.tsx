import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import {
  experimental_Icon as Icon,
  experimental_useOwnTab,
  experimental_useSidebarThreads,
  experimental_useThreadActions,
  useBbNavigate,
  type BbNavigate,
  type ExperimentalBadge,
  type ExperimentalOwnTab,
  type ExperimentalThreadComposerOverlayProps,
  type ExperimentalThreadHeaderLeadingProps,
  type ExperimentalThreadHeaderTrailingProps,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginThreadActionTarget,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@bb/shared-ui/button";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@bb/shared-ui/dropdown-menu";
import {
  adjacentInboxThread,
  inboxQueue,
  inboxSections,
  isSnoozed,
  nextInboxStep,
  nextSnoozeWake,
  type InboxSections,
} from "./queue";

export const INBOX_PANEL_PATH = "inbox";

const MAX_TIMEOUT_MS = 2_147_483_647;
const CORE_ACTION_OWNER = "bb--core";
const ARCHIVE_ACTION_KEYS = [`${CORE_ACTION_OWNER}/archive`];
const SNOOZE_ACTION_KEYS = [`${CORE_ACTION_OWNER}/snooze`];

export interface InboxState {
  isLoaded: boolean;
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  sections: InboxSections;
  queue: PluginSidebarThread[];
  now: number;
}

function useInboxNow(threads: readonly PluginSidebarThread[]): number {
  const [now, setNow] = useState(Date.now);
  useEffect(() => {
    const wake = nextSnoozeWake(threads, Date.now());
    if (wake === null) return;
    const timer = setTimeout(
      () => setNow(Date.now()),
      Math.min(wake - Date.now() + 1, MAX_TIMEOUT_MS),
    );
    return () => clearTimeout(timer);
  }, [threads, now]);
  return now;
}

export function useInbox(): InboxState {
  const { status, threads, projects } = experimental_useSidebarThreads();
  const now = useInboxNow(threads);
  return useMemo(() => {
    const sections = inboxSections(threads, now);
    return {
      isLoaded: status === "ready",
      threads,
      projects,
      sections,
      queue: inboxQueue(sections),
      now,
    };
  }, [now, projects, status, threads]);
}

export function useInboxBadge(): ExperimentalBadge | null {
  const count = useInbox().queue.length;
  return count === 0 ? null : { count, label: `${count} in Inbox` };
}

export function actionTarget(
  thread: PluginSidebarThread,
): PluginThreadActionTarget {
  return {
    id: thread.id,
    projectId: thread.projectId,
    parentThreadId: thread.parentThreadId,
    parentNotifications: thread.parentNotifications,
    archivedAt: thread.archivedAt,
    pinnedAt: thread.pinnedAt,
    sectionId: thread.sectionId,
    isUnread: thread.isUnread,
    status: thread.status,
    environment:
      thread.environment?.id == null
        ? null
        : { id: thread.environment.id, path: thread.environment.path },
  };
}

function showThread(ownTab: ExperimentalOwnTab, thread: PluginSidebarThread) {
  ownTab.show({
    kind: "thread",
    projectId: thread.projectId,
    threadId: thread.id,
  });
}

export function InboxProjectLabel({
  projectId,
  projects,
  className,
  separator,
}: {
  projectId: string;
  projects: readonly PluginSidebarProject[];
  className?: string;
  separator?: string;
}) {
  const project = projects.find((candidate) => candidate.id === projectId);
  if (project === undefined) return null;
  return (
    <>
      <span
        className={cn("truncate", className)}
        style={{ color: project.experimental_color }}
      >
        {project.name}
      </span>
      {separator === undefined ? null : (
        <span aria-hidden className="text-muted-foreground">
          {separator}
        </span>
      )}
    </>
  );
}

export function SnoozeMenu({
  thread,
  children,
}: {
  thread: PluginThreadActionTarget;
  children: ReactNode;
}) {
  const [snooze] = experimental_useThreadActions(thread, {
    keys: SNOOZE_ACTION_KEYS,
  });
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

function useInboxNavigation(threadId: string) {
  const ownTab = experimental_useOwnTab(INBOX_PANEL_PATH);
  const { queue, threads } = useInbox();
  const thread = threads.find((candidate) => candidate.id === threadId);
  const target = useMemo(
    () => (thread === undefined ? null : actionTarget(thread)),
    [thread],
  );
  const index = queue.findIndex((entry) => entry.id === threadId);
  const go = (step: -1 | 1) => {
    const next = adjacentInboxThread(queue, threadId, step);
    if (next !== undefined) showThread(ownTab, next);
  };
  return {
    isActive: ownTab.isActive,
    queue,
    index,
    go,
    target,
    isOpen: thread !== undefined && thread.archivedAt === null,
  };
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

function ArchiveButton({
  target,
  className,
  labelClassName,
}: {
  target: PluginThreadActionTarget;
  className: string;
  labelClassName?: string;
}) {
  const [archive] = experimental_useThreadActions(target, {
    keys: ARCHIVE_ACTION_KEYS,
  });
  if (archive === undefined) return null;
  return (
    <Button
      type="button"
      variant="ghost"
      size="sm"
      className={className}
      disabled={archive.action.disabled}
      onClick={() => void archive.action.run()}
    >
      <Icon name="Archive" className="size-3.5" />
      <span className={labelClassName}>Archive</span>
    </Button>
  );
}

function InboxActions({
  nav: { target, isOpen },
  buttonClassName,
  labelClassName,
}: {
  nav: InboxNavigation;
  buttonClassName: string;
  labelClassName?: string;
}) {
  if (!isOpen || target === null) return null;
  return (
    <>
      <SnoozeMenu thread={target}>
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
      <ArchiveButton
        target={target}
        className={buttonClassName}
        labelClassName={labelClassName}
      />
    </>
  );
}

export function InboxHeaderControls({
  threadId,
}: ExperimentalThreadHeaderTrailingProps) {
  const nav = useInboxNavigation(threadId);
  if (!nav.isActive || nav.queue.length === 0) return null;
  return (
    <div
      data-inbox-navigator=""
      className="flex shrink-0 items-center gap-1 text-xs"
    >
      <InboxPager nav={nav} buttonClassName="size-7" />
      <InboxActions nav={nav} buttonClassName="h-7 gap-1.5 px-2 text-xs" />
    </div>
  );
}

const INBOX_BUBBLE_CLASS =
  "pointer-events-auto flex h-11 items-center rounded-full border border-border/70 bg-surface-scrim/75 text-xs shadow-lg backdrop-blur-md";

export function InboxFloatingControls({
  threadId,
  isPhone,
}: ExperimentalThreadComposerOverlayProps) {
  const nav = useInboxNavigation(threadId);
  if (!isPhone || !nav.isActive || nav.queue.length === 0) return null;
  return (
    <div
      data-inbox-navigator=""
      data-inbox-floating=""
      className="flex items-end justify-between gap-2 pb-2 pl-[max(0.75rem,env(safe-area-inset-left))] pr-[max(0.75rem,env(safe-area-inset-right))]"
    >
      <div className={INBOX_BUBBLE_CLASS}>
        <InboxPager nav={nav} buttonClassName="size-11 rounded-full" />
      </div>
      {nav.isOpen ? (
        <div className={INBOX_BUBBLE_CLASS}>
          <InboxActions
            nav={nav}
            buttonClassName="size-11 rounded-full"
            labelClassName="sr-only"
          />
        </div>
      ) : null}
    </div>
  );
}

export function InboxTitleProject({
  threadId,
}: ExperimentalThreadHeaderLeadingProps) {
  const { isActive } = experimental_useOwnTab(INBOX_PANEL_PATH);
  const { threads, projects } = useInbox();
  const projectId = threads.find((thread) => thread.id === threadId)?.projectId;
  if (!isActive || projectId === undefined) return null;
  return (
    <span className="mr-1 flex min-w-0 items-baseline gap-1 text-sm">
      <InboxProjectLabel
        projectId={projectId}
        projects={projects}
        className="max-w-40 shrink-0"
        separator="/"
      />
    </span>
  );
}

export function InboxPanel() {
  const ownTab = experimental_useOwnTab(INBOX_PANEL_PATH);
  const { isLoaded, queue } = useInbox();
  const opened = useRef(false);
  useEffect(() => {
    if (!isLoaded || opened.current) return;
    opened.current = true;
    const top = queue[0];
    if (top === undefined) ownTab.show({ kind: "compose" });
    else showThread(ownTab, top);
  }, [isLoaded, ownTab, queue]);
  return null;
}

function announceInboxAdvance(
  paneId: string,
  left: PluginSidebarThread | undefined,
  next: PluginSidebarThread,
) {
  const replied =
    left !== undefined &&
    left.archivedAt === null &&
    !isSnoozed(left, Date.now());
  toast(
    replied ? `Sent to ${left.displayTitle}` : `Next: ${next.displayTitle}`,
    {
      id: "inbox-advance",
      duration: 2500,
      description: replied ? `Next: ${next.displayTitle}` : undefined,
    },
  );
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  requestAnimationFrame(() => {
    document
      .querySelector(`[data-split-pane-id="${CSS.escape(paneId)}"]`)
      ?.animate(
        [
          { opacity: 0.3, transform: "translateX(16px)" },
          { opacity: 1, transform: "none" },
        ],
        { duration: 250, easing: "cubic-bezier(0.32,0.72,0,1)" },
      );
  });
}

interface InboxCommandTarget {
  ownTab: ExperimentalOwnTab;
  navigate: BbNavigate;
  queue: readonly PluginSidebarThread[];
}

let commandTarget: InboxCommandTarget | null = null;

export function openInboxAtTop(): void {
  if (commandTarget === null) return;
  const top = commandTarget.queue[0];
  if (top === undefined) {
    commandTarget.navigate.toPluginPanel(INBOX_PANEL_PATH);
    return;
  }
  showThread(commandTarget.ownTab, top);
}

function holdsTypedText(element: Element | null): boolean {
  if (
    element instanceof HTMLInputElement ||
    element instanceof HTMLTextAreaElement
  ) {
    return element.value !== "";
  }
  return (
    element instanceof HTMLElement &&
    element.isContentEditable &&
    element.textContent?.trim() !== ""
  );
}

export function canStepInbox(): boolean {
  return (
    commandTarget !== null &&
    commandTarget.ownTab.isActive &&
    commandTarget.queue.length > 0 &&
    !holdsTypedText(document.activeElement)
  );
}

export function stepInbox(step: -1 | 1): void {
  if (commandTarget === null) return;
  const { ownTab, queue } = commandTarget;
  const shownThreadId =
    ownTab.focused?.kind === "thread" ? ownTab.focused.threadId : null;
  const next = adjacentInboxThread(queue, shownThreadId, step);
  if (next !== undefined) showThread(ownTab, next);
}

export function InboxController() {
  const ownTab = experimental_useOwnTab(INBOX_PANEL_PATH);
  const navigate = useBbNavigate();
  const { isLoaded, queue, threads } = useInbox();
  const tracked = useRef<string | null | undefined>(undefined);
  const { isActive, focused } = ownTab;

  useEffect(() => {
    commandTarget = { ownTab, navigate, queue };
    return () => {
      commandTarget = null;
    };
  }, [navigate, ownTab, queue]);

  useEffect(() => {
    if (!isLoaded || !isActive || focused === null) return;
    if (focused.kind === "other") return;
    const shownThreadId = focused.kind === "thread" ? focused.threadId : null;
    const step = nextInboxStep(
      queue,
      shownThreadId,
      tracked.current,
      focused.kind === "compose" && focused.hasDraft(),
    );
    if (step.kind === "stay") {
      if (queue.some((thread) => thread.id === shownThreadId)) {
        tracked.current = shownThreadId;
      }
      return;
    }
    if (step.kind === "done") {
      toast.success("All caught up");
      tracked.current = null;
      ownTab.show({ kind: "compose" });
      return;
    }
    tracked.current = step.thread.id;
    showThread(ownTab, step.thread);
    if (shownThreadId !== null) {
      announceInboxAdvance(
        focused.paneId,
        threads.find((thread) => thread.id === shownThreadId),
        step.thread,
      );
    }
  }, [focused, isActive, isLoaded, ownTab, queue, threads]);

  return null;
}
