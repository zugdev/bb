import { useMemo, useState, type MouseEvent } from "react";
import {
  experimental_Icon as Icon,
  experimental_useOwnTab,
  experimental_useSidebarThreads,
  useBbNavigate,
  type PluginSidebarProject,
  type PluginSidebarThread,
  type PluginThreadListProps,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import { CHROME_SECTION_LABEL_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { formatCompactRelativeTime } from "@bb/shared-ui/info-list-row";
import {
  actionTarget,
  INBOX_PANEL_PATH,
  InboxProjectLabel,
  SnoozeMenu,
  useInbox,
} from "./inbox";
import {
  arrivedAt,
  formatSnoozeWake,
  liveThreadDescendants,
  threadDot,
  type InboxSections,
  type ThreadDescendants,
  type ThreadDot,
} from "./queue";

interface InboxSectionSpec {
  key: keyof InboxSections;
  label: string;
  collapsedByDefault: boolean;
}

const SECTIONS: readonly InboxSectionSpec[] = [
  { key: "needsAnswer", label: "Needs an answer", collapsedByDefault: false },
  { key: "waitingOnYou", label: "Waiting on you", collapsedByDefault: false },
  { key: "working", label: "Working", collapsedByDefault: false },
  { key: "snoozed", label: "Snoozed", collapsedByDefault: true },
];

const SECTION_BUTTON_CLASS = cn(
  CHROME_SECTION_LABEL_CLASS,
  "flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left hover:bg-state-hover",
);

const STATUS_DOTS: Record<ThreadDot, { className: string; label: string }> = {
  working: { className: "bg-muted-foreground", label: "Working" },
  done: { className: "bg-success", label: "Finished, unread" },
  waiting: { className: "bg-warning", label: "Waiting for you" },
  failed: { className: "bg-destructive", label: "Failed" },
};

function ThreadStatusDot({ dot }: { dot: ThreadDot | null }) {
  if (dot === null) return null;
  const { className, label } = STATUS_DOTS[dot];
  return (
    <span
      role="img"
      aria-label={label}
      className="relative inline-flex size-2 shrink-0"
    >
      {dot === "working" ? (
        <span
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none",
            className,
          )}
        />
      ) : null}
      <span className={cn("relative size-2 rounded-full", className)} />
    </span>
  );
}

export function InboxSidebarList({
  activeThreadId,
  onNavigate,
}: PluginThreadListProps) {
  const { sections, queue, now, threads, projects } = useInbox();
  const ownTab = experimental_useOwnTab(INBOX_PANEL_PATH);
  const navigate = useBbNavigate();
  const descendants = useMemo(() => liveThreadDescendants(threads), [threads]);
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        SECTIONS.filter((spec) => spec.collapsedByDefault).map(
          (spec) => spec.key,
        ),
      ),
  );
  const open = (thread: PluginSidebarThread, event: MouseEvent) => {
    if (event.metaKey || event.ctrlKey) {
      navigate.toThread(thread.id, { experimental_tab: true });
    } else if (ownTab.isActive) {
      ownTab.show({
        kind: "thread",
        projectId: thread.projectId,
        threadId: thread.id,
      });
    } else {
      navigate.toThread(thread.id);
    }
    onNavigate();
  };
  const toggle = (key: string) =>
    setCollapsed((current) => {
      const next = new Set(current);
      if (!next.delete(key)) next.add(key);
      return next;
    });
  return (
    <nav aria-label="Inbox" className="flex flex-col gap-1 px-2">
      {queue.length === 0 ? (
        <div className="flex flex-col items-center gap-1 px-2 py-6 text-center text-sm text-muted-foreground">
          <Icon name="Inbox" className="size-5" />
          <span>All caught up</span>
          {sections.working.length > 0 ? (
            <span className="text-xs">
              {sections.working.length}{" "}
              {sections.working.length === 1 ? "agent" : "agents"} working
            </span>
          ) : null}
        </div>
      ) : null}
      {SECTIONS.map((spec) => {
        const sectionThreads = sections[spec.key];
        if (sectionThreads.length === 0) return null;
        const isCollapsed = collapsed.has(spec.key);
        return (
          <section key={spec.key} aria-label={spec.label}>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              className={SECTION_BUTTON_CLASS}
              onClick={() => toggle(spec.key)}
            >
              <span className="truncate">{spec.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {sectionThreads.length}
              </span>
              <Icon
                name={isCollapsed ? "ChevronRight" : "ChevronDown"}
                className="ml-auto size-3.5"
              />
            </button>
            {isCollapsed ? null : (
              <ul className="flex flex-col">
                {sectionThreads.map((thread) => (
                  <InboxRow
                    key={thread.id}
                    thread={thread}
                    projects={projects}
                    isCurrent={thread.id === activeThreadId}
                    trailing={
                      spec.key === "snoozed" &&
                      thread.experimental_snoozedUntil !== null
                        ? formatSnoozeWake(
                            thread.experimental_snoozedUntil,
                            now,
                          )
                        : formatCompactRelativeTime({
                            timestamp: arrivedAt(thread),
                            now,
                          })
                    }
                    dot={threadDot(thread, descendants)}
                    onOpen={(event) => open(thread, event)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
      <ArchivedInboxSection
        activeThreadId={activeThreadId}
        projects={projects}
        now={now}
        descendants={descendants}
        onOpen={open}
      />
    </nav>
  );
}

const ARCHIVED_INBOX_STEP = 10;

function ArchivedThreads({
  activeThreadId,
  projects,
  now,
  descendants,
  onOpen,
}: {
  activeThreadId: string | null;
  projects: readonly PluginSidebarProject[];
  now: number;
  descendants: ThreadDescendants;
  onOpen: (thread: PluginSidebarThread, event: MouseEvent) => void;
}) {
  const { threads, experimental_archived: archived } =
    experimental_useSidebarThreads({ experimental_lifecycles: ["archived"] });
  const rootThreads = useMemo(
    () =>
      threads
        .filter(
          (thread) =>
            thread.isArchived &&
            thread.parentThreadId === null &&
            !thread.isHidden,
        )
        .sort((a, b) => (b.archivedAt ?? 0) - (a.archivedAt ?? 0)),
    [threads],
  );
  const [visibleCount, setVisibleCount] = useState(ARCHIVED_INBOX_STEP);
  const hasMore =
    rootThreads.length > visibleCount || archived?.hasNextPage === true;
  const showMore = () => {
    const nextCount = visibleCount + ARCHIVED_INBOX_STEP;
    setVisibleCount(nextCount);
    if (nextCount >= rootThreads.length && archived?.hasNextPage) {
      void archived.fetchNextPage();
    }
  };
  return (
    <ul className="flex flex-col">
      {archived === null || archived.status !== "ready" ? (
        <li className="px-2 py-1 text-sm text-muted-foreground">
          {archived?.status === "error" ? "Could not load" : "Loading…"}
        </li>
      ) : rootThreads.length === 0 ? (
        <li className="px-2 py-1 text-sm text-muted-foreground">
          Nothing archived
        </li>
      ) : null}
      {rootThreads.slice(0, visibleCount).map((thread) => (
        <InboxRow
          key={thread.id}
          thread={thread}
          projects={projects}
          isCurrent={thread.id === activeThreadId}
          trailing={formatCompactRelativeTime({
            timestamp: thread.archivedAt ?? thread.updatedAt,
            now,
          })}
          dot={threadDot(thread, descendants)}
          onOpen={(event) => onOpen(thread, event)}
        />
      ))}
      {hasMore ? (
        <li>
          <button
            type="button"
            disabled={archived?.isFetchingNextPage === true}
            className="w-full rounded-md px-2 py-1 text-left text-sm text-muted-foreground hover:bg-state-hover"
            onClick={showMore}
          >
            {archived?.isFetchingNextPage ? "Loading…" : "Show more"}
          </button>
        </li>
      ) : null}
    </ul>
  );
}

function ArchivedInboxSection(props: {
  activeThreadId: string | null;
  projects: readonly PluginSidebarProject[];
  now: number;
  descendants: ThreadDescendants;
  onOpen: (thread: PluginSidebarThread, event: MouseEvent) => void;
}) {
  const [isExpanded, setIsExpanded] = useState(false);
  return (
    <section aria-label="Archived">
      <button
        type="button"
        aria-expanded={isExpanded}
        className={SECTION_BUTTON_CLASS}
        onClick={() => setIsExpanded((current) => !current)}
      >
        <span className="truncate">Archived</span>
        <Icon
          name={isExpanded ? "ChevronDown" : "ChevronRight"}
          className="ml-auto size-3.5"
        />
      </button>
      {isExpanded ? <ArchivedThreads {...props} /> : null}
    </section>
  );
}

function InboxRow({
  thread,
  projects,
  isCurrent,
  trailing,
  dot,
  onOpen,
}: {
  thread: PluginSidebarThread;
  projects: readonly PluginSidebarProject[];
  isCurrent: boolean;
  trailing: string;
  dot: ThreadDot | null;
  onOpen: (event: MouseEvent) => void;
}) {
  const target = useMemo(() => actionTarget(thread), [thread]);
  return (
    <li className="group relative pointer-coarse:flex pointer-coarse:items-center">
      <button
        type="button"
        data-thread-id={thread.id}
        aria-current={isCurrent ? "true" : undefined}
        className={cn(
          "flex w-full min-w-0 items-center gap-2 rounded-md px-2 py-1 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isCurrent && "bg-sidebar-accent",
        )}
        onClick={onOpen}
      >
        <span className="flex size-3 shrink-0 items-center justify-center">
          <ThreadStatusDot dot={dot} />
        </span>
        <span className="flex min-w-0 flex-1 flex-col">
          <InboxProjectLabel
            projectId={thread.projectId}
            projects={projects}
            className="text-2xs leading-4"
          />
          <span className="truncate">{thread.displayTitle}</span>
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground pointer-fine:group-hover:invisible pointer-fine:group-focus-within:invisible pointer-fine:group-has-data-[state=open]:invisible">
          {trailing}
        </span>
      </button>
      <div className="absolute inset-y-0 right-1 hidden items-center group-focus-within:flex group-hover:flex group-has-data-[state=open]:flex pointer-coarse:static pointer-coarse:flex">
        <SnoozeMenu thread={target}>
          <button
            type="button"
            aria-label={`Snooze ${thread.displayTitle}`}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground pointer-coarse:size-9 hover:bg-state-hover hover:text-foreground"
          >
            <Icon name="AlarmClock" className="size-3.5" />
          </button>
        </SnoozeMenu>
      </div>
    </li>
  );
}
