import type { ThreadListEntry } from "@bb/domain";
import {
  liveThreadDescendants,
  threadDot,
} from "@/components/thread/thread-dot";

export function focusQueue(
  threads: Iterable<ThreadListEntry>,
): ThreadListEntry[] {
  const list = [...threads];
  const descendants = liveThreadDescendants(list);
  return list
    .filter(
      (thread) =>
        thread.parentThreadId === null &&
        thread.archivedAt === null &&
        thread.deletedAt === null &&
        thread.visibility === "visible" &&
        thread.latestAttentionAt > (thread.lastUserMessageAt ?? 0) &&
        threadDot(thread, descendants) !== "working",
    )
    .sort((a, b) => a.latestAttentionAt - b.latestAttentionAt);
}

export type FocusStep =
  | { kind: "stay" }
  | { kind: "open"; thread: ThreadListEntry }
  | { kind: "done" };

export function nextFocusStep(
  queue: readonly ThreadListEntry[],
  shownThreadId: string | null,
  trackedThreadId: string | null | undefined,
): FocusStep {
  if (shownThreadId !== null && queue.some((t) => t.id === shownThreadId)) {
    return { kind: "stay" };
  }
  if (shownThreadId !== null && trackedThreadId !== shownThreadId) {
    return { kind: "stay" };
  }
  const head = queue[0];
  if (head !== undefined) return { kind: "open", thread: head };
  return shownThreadId === null ? { kind: "stay" } : { kind: "done" };
}
