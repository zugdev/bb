import { createContext, useContext } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  formatRelativeTime,
  homeThreadDot,
  NO_THREAD_DESCENDANTS,
  type HomeThreadDot,
  type ThreadDescendants,
} from "./home-overview";

export const ThreadDescendantsContext = createContext<ThreadDescendants>(
  NO_THREAD_DESCENDANTS,
);

export type OpenThread = (
  thread: PluginSidebarThread,
  options: { newTab: boolean },
) => void;

const STATUS_DOTS: Record<HomeThreadDot, { className: string; label: string }> =
  {
    working: { className: "bg-muted-foreground", label: "Working" },
    done: { className: "bg-success", label: "Finished, unread" },
    waiting: { className: "bg-warning", label: "Waiting for you" },
    failed: { className: "bg-destructive", label: "Failed" },
  };

export function ThreadStatusDot({ dot }: { dot: HomeThreadDot | null }) {
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

export function ThreadRow({
  thread,
  projectName,
  time,
  onOpen,
}: {
  thread: PluginSidebarThread;
  projectName: string | null;
  time: number;
  onOpen: OpenThread;
}) {
  const descendants = useContext(ThreadDescendantsContext);
  return (
    <button
      type="button"
      className="-mx-2 flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) =>
        onOpen(thread, { newTab: event.metaKey || event.ctrlKey })
      }
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <ThreadStatusDot dot={homeThreadDot(thread, descendants)} />
      </span>
      <span
        className={cn(
          "min-w-0 flex-1 truncate",
          thread.archivedAt !== null && "text-muted-foreground",
        )}
      >
        {thread.displayTitle}
      </span>
      {projectName === null ? null : (
        <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
          {projectName}
        </span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatRelativeTime(time, Date.now())}
      </span>
    </button>
  );
}
