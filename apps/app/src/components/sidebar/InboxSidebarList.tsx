import { useMemo, useState } from "react";
import { useStore } from "jotai";
import { useNavigate } from "react-router-dom";
import { PERSONAL_PROJECT_ID, type ThreadListEntry } from "@bb/domain";
import { cn } from "@bb/shared-ui/lib/utils";
import { Icon } from "@bb/shared-ui/icon";
import { CHROME_SECTION_LABEL_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { formatCompactRelativeTime } from "@bb/shared-ui/info-list-row";
import {
  ThreadStatusDot,
  useThreadDescendants,
} from "@/components/thread/ThreadStatusDot";
import { threadDot } from "@/components/thread/thread-dot";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { useRouteState } from "@/hooks/useRouteState";
import { getThreadDisplayTitle } from "@/lib/thread-title";
import { formatSnoozeWake } from "@/lib/snooze";
import { threadListEntryActionTarget } from "@/lib/thread-actions/thread-action-target";
import {
  showInInboxTab,
  SnoozeMenu,
  useInbox,
} from "@/views/thread-detail/InboxTabController";

interface InboxSectionSpec {
  key: "needsAnswer" | "waitingOnYou" | "working" | "snoozed";
  label: string;
  collapsedByDefault: boolean;
}

const SECTIONS: readonly InboxSectionSpec[] = [
  { key: "needsAnswer", label: "Needs an answer", collapsedByDefault: false },
  { key: "waitingOnYou", label: "Waiting on you", collapsedByDefault: false },
  { key: "working", label: "Working", collapsedByDefault: true },
  { key: "snoozed", label: "Snoozed", collapsedByDefault: true },
];

function useProjectNames(): ReadonlyMap<string, string> {
  const data = useSidebarNavigation().data;
  return useMemo(() => {
    const names = new Map<string, string>();
    if (data === undefined) return names;
    names.set(PERSONAL_PROJECT_ID, data.personalProject.name);
    for (const project of data.projects) names.set(project.id, project.name);
    return names;
  }, [data]);
}

export function InboxSidebarList({ onNavigate }: { onNavigate: () => void }) {
  const { sections, queue, now } = useInbox();
  const projectNames = useProjectNames();
  const descendants = useThreadDescendants();
  const { threadId: shownThreadId } = useRouteState();
  const store = useStore();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState<ReadonlySet<string>>(
    () =>
      new Set(
        SECTIONS.filter((spec) => spec.collapsedByDefault).map(
          (spec) => spec.key,
        ),
      ),
  );
  const open = (thread: ThreadListEntry) => {
    showInInboxTab(store, navigate, {
      kind: "thread",
      projectId: thread.projectId,
      threadId: thread.id,
    });
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
        const threads = sections[spec.key];
        if (threads.length === 0) return null;
        const isCollapsed = collapsed.has(spec.key);
        return (
          <section key={spec.key} aria-label={spec.label}>
            <button
              type="button"
              aria-expanded={!isCollapsed}
              className={cn(
                CHROME_SECTION_LABEL_CLASS,
                "flex h-7 w-full items-center gap-1.5 rounded-md px-2 text-left hover:bg-state-hover",
              )}
              onClick={() => toggle(spec.key)}
            >
              <span className="truncate">{spec.label}</span>
              <span className="tabular-nums text-muted-foreground">
                {threads.length}
              </span>
              <Icon
                name={isCollapsed ? "ChevronRight" : "ChevronDown"}
                className="ml-auto size-3.5"
              />
            </button>
            {isCollapsed ? null : (
              <ul className="flex flex-col">
                {threads.map((thread) => (
                  <InboxRow
                    key={thread.id}
                    thread={thread}
                    projectName={projectNames.get(thread.projectId) ?? null}
                    isCurrent={thread.id === shownThreadId}
                    trailing={
                      spec.key === "snoozed" && thread.snoozedUntil !== null
                        ? formatSnoozeWake(thread.snoozedUntil, now)
                        : formatCompactRelativeTime({
                            timestamp: Math.max(
                              thread.latestAttentionAt,
                              thread.snoozedUntil ?? 0,
                            ),
                            now,
                          })
                    }
                    dot={threadDot(thread, descendants)}
                    onOpen={() => open(thread)}
                  />
                ))}
              </ul>
            )}
          </section>
        );
      })}
    </nav>
  );
}

function InboxRow({
  thread,
  projectName,
  isCurrent,
  trailing,
  dot,
  onOpen,
}: {
  thread: ThreadListEntry;
  projectName: string | null;
  isCurrent: boolean;
  trailing: string;
  dot: ReturnType<typeof threadDot>;
  onOpen: () => void;
}) {
  const target = useMemo(() => threadListEntryActionTarget(thread), [thread]);
  return (
    <li className="group relative">
      <button
        type="button"
        data-thread-id={thread.id}
        aria-current={isCurrent ? "true" : undefined}
        className={cn(
          "flex h-7 w-full min-w-0 items-center gap-2 rounded-md px-2 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          isCurrent && "bg-sidebar-accent",
        )}
        onClick={onOpen}
      >
        <span className="flex size-3 shrink-0 items-center justify-center">
          <ThreadStatusDot dot={dot} />
        </span>
        {projectName === null ? null : (
          <span className="max-w-24 shrink-0 truncate rounded bg-muted px-1.5 text-2xs leading-4 text-muted-foreground">
            {projectName}
          </span>
        )}
        <span className="min-w-0 flex-1 truncate">
          {getThreadDisplayTitle(thread)}
        </span>
        <span className="shrink-0 text-2xs tabular-nums text-muted-foreground group-hover:invisible group-focus-within:invisible">
          {trailing}
        </span>
      </button>
      <div className="absolute inset-y-0 right-1 hidden items-center group-focus-within:flex group-hover:flex">
        <SnoozeMenu thread={target}>
          <button
            type="button"
            aria-label={`Snooze ${getThreadDisplayTitle(thread)}`}
            className="flex size-6 items-center justify-center rounded-md text-muted-foreground hover:bg-state-hover hover:text-foreground"
          >
            <Icon name="AlarmClock" className="size-3.5" />
          </button>
        </SnoozeMenu>
      </div>
    </li>
  );
}
