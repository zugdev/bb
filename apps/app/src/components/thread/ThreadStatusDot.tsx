import type { ThreadListEntry } from "@bb/domain";
import { cn } from "@bb/shared-ui/lib/utils";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { threadEntryMapFor } from "@/lib/sidebar-thread-entries";
import {
  threadDot,
  liveThreadDescendants,
  NO_THREAD_DESCENDANTS,
  type ThreadDot,
  type ThreadDescendants,
} from "@/components/thread/thread-dot";

const STATUS_DOTS: Record<ThreadDot, { className: string; label: string }> =
  {
    working: { className: "bg-muted-foreground", label: "Working" },
    done: { className: "bg-success", label: "Finished, unread" },
    waiting: { className: "bg-warning", label: "Waiting for you" },
    failed: { className: "bg-destructive", label: "Failed" },
  };

const DOT_PRIORITY: readonly ThreadDot[] = [
  "waiting",
  "failed",
  "working",
  "done",
];

export function mostUrgentThreadDot(
  dots: readonly (ThreadDot | null)[],
): ThreadDot | null {
  return DOT_PRIORITY.find((dot) => dots.includes(dot)) ?? null;
}

export function ThreadStatusDot({
  dot,
  className,
}: {
  dot: ThreadDot | null;
  className?: string;
}) {
  if (dot === null) return null;
  const { className: colorClassName, label } = STATUS_DOTS[dot];
  return (
    <span
      role="img"
      aria-label={label}
      className={cn("relative inline-flex size-2 shrink-0", className)}
    >
      {dot === "working" ? (
        <span
          className={cn(
            "absolute inset-0 animate-ping rounded-full opacity-60 motion-reduce:animate-none",
            colorClassName,
          )}
        />
      ) : null}
      <span className={cn("relative size-2 rounded-full", colorClassName)} />
    </span>
  );
}

const descendantsByEntries = new WeakMap<
  ReadonlyMap<string, ThreadListEntry>,
  ThreadDescendants
>();

export function threadDescendantsFor(
  entries: ReadonlyMap<string, ThreadListEntry>,
): ThreadDescendants {
  if (entries.size === 0) return NO_THREAD_DESCENDANTS;
  let descendants = descendantsByEntries.get(entries);
  if (descendants === undefined) {
    descendants = liveThreadDescendants(entries.values());
    descendantsByEntries.set(entries, descendants);
  }
  return descendants;
}

export function useThreadEntriesById(): ReadonlyMap<string, ThreadListEntry> {
  return threadEntryMapFor(useSidebarNavigation().data);
}

export function useThreadDescendants(): ThreadDescendants {
  return threadDescendantsFor(useThreadEntriesById());
}

export function useThreadDot(threadId: string | null): ThreadDot | null {
  const entries = useThreadEntriesById();
  const entry = threadId === null ? undefined : entries.get(threadId);
  return entry === undefined
    ? null
    : threadDot(entry, threadDescendantsFor(entries));
}
