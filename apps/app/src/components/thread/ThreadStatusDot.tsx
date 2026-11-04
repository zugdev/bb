import { useMemo } from "react";
import type { ThreadListEntry } from "@bb/domain";
import { cn } from "@bb/shared-ui/lib/utils";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { homeThreadDot, type HomeThreadDot } from "@/views/home-overview";

const STATUS_DOTS: Record<HomeThreadDot, { className: string; label: string }> =
  {
    working: { className: "bg-muted-foreground", label: "Working" },
    done: { className: "bg-success", label: "Finished, unread" },
    waiting: { className: "bg-warning", label: "Waiting for you" },
    failed: { className: "bg-destructive", label: "Failed" },
  };

const DOT_PRIORITY: readonly HomeThreadDot[] = [
  "waiting",
  "failed",
  "working",
  "done",
];

export function mostUrgentThreadDot(
  dots: readonly (HomeThreadDot | null)[],
): HomeThreadDot | null {
  return DOT_PRIORITY.find((dot) => dots.includes(dot)) ?? null;
}

export function ThreadStatusDot({
  dot,
  className,
}: {
  dot: HomeThreadDot | null;
  className?: string;
}) {
  if (dot === null) return null;
  const { className: colorClassName, label } = STATUS_DOTS[dot];
  return (
    <span
      role="img"
      aria-label={label}
      title={label}
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

export function useThreadEntriesById(): ReadonlyMap<string, ThreadListEntry> {
  const { data } = useSidebarNavigation();
  return useMemo(() => {
    const byId = new Map<string, ThreadListEntry>();
    if (data === undefined) return byId;
    for (const project of [data.personalProject, ...data.projects]) {
      for (const thread of project.threads) byId.set(thread.id, thread);
    }
    return byId;
  }, [data]);
}

export function useThreadDot(threadId: string | null): HomeThreadDot | null {
  const entries = useThreadEntriesById();
  const entry = threadId === null ? undefined : entries.get(threadId);
  return entry === undefined ? null : homeThreadDot(entry);
}
