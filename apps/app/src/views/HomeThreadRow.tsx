import type { ThreadListEntry } from "@bb/domain";
import { ThreadStatusDot } from "@/components/thread/ThreadStatusDot";
import { formatRelativeTime } from "@/lib/relative-time";
import { getThreadDisplayTitle } from "@/lib/thread-title";
import { homeThreadDot } from "./home-overview";

export type OpenThread = (
  thread: ThreadListEntry,
  options: { newTab: boolean },
) => void;

export function ThreadRow({
  thread,
  projectName,
  time,
  onOpen,
}: {
  thread: ThreadListEntry;
  projectName: string | null;
  time: number;
  onOpen: OpenThread;
}) {
  return (
    <button
      type="button"
      className="-mx-2 flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onClick={(event) =>
        onOpen(thread, { newTab: event.metaKey || event.ctrlKey })
      }
    >
      <span className="flex size-4 shrink-0 items-center justify-center">
        <ThreadStatusDot dot={homeThreadDot(thread)} />
      </span>
      <span className="min-w-0 flex-1 truncate">
        {getThreadDisplayTitle(thread)}
      </span>
      {projectName === null ? null : (
        <span className="max-w-32 shrink-0 truncate text-xs text-muted-foreground">
          {projectName}
        </span>
      )}
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
        {formatRelativeTime({ timestamp: time, now: Date.now() })}
      </span>
    </button>
  );
}
