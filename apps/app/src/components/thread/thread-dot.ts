import type { ThreadListEntry } from "@bb/domain";
import { experimental_resolveThreadStatus } from "@get-bb/plugin-sdk/internal/thread-status";
import { toThreadStatusThread } from "@/lib/plugin-sidebar-threads";
import { SIDE_CHAT_PLUGIN_ID } from "@/lib/side-chat-plugin";

export type ThreadDot = "working" | "done" | "waiting" | "failed";

export type ThreadDescendants = (threadId: string) => ThreadListEntry[];

export const NO_THREAD_DESCENDANTS: ThreadDescendants = () => [];

function countsTowardParentStatus(thread: ThreadListEntry): boolean {
  return (
    thread.archivedAt === null &&
    !(
      thread.visibility === "hidden" &&
      thread.originPluginId === SIDE_CHAT_PLUGIN_ID
    )
  );
}

export function liveThreadDescendants(
  threads: Iterable<ThreadListEntry>,
): ThreadDescendants {
  const childrenByParentId = new Map<string, ThreadListEntry[]>();
  for (const thread of threads) {
    if (thread.parentThreadId === null || !countsTowardParentStatus(thread))
      continue;
    const siblings = childrenByParentId.get(thread.parentThreadId);
    if (siblings === undefined)
      childrenByParentId.set(thread.parentThreadId, [thread]);
    else siblings.push(thread);
  }
  return (threadId) => {
    const descendants: ThreadListEntry[] = [];
    const seen = new Set([threadId]);
    const pending = [threadId];
    for (let id = pending.pop(); id !== undefined; id = pending.pop()) {
      for (const child of childrenByParentId.get(id) ?? []) {
        if (seen.has(child.id)) continue;
        seen.add(child.id);
        descendants.push(child);
        pending.push(child.id);
      }
    }
    return descendants;
  };
}

function resolveHomeThreadStatus(
  thread: ThreadListEntry,
  descendants: ThreadDescendants,
) {
  return experimental_resolveThreadStatus({
    thread: toThreadStatusThread(thread),
    hiddenThreads: descendants(thread.id).map(toThreadStatusThread),
    hasUnsubmittedDraft: false,
    rowStatus: null,
  });
}

export function threadDot(
  thread: ThreadListEntry,
  descendants: ThreadDescendants = NO_THREAD_DESCENDANTS,
): ThreadDot | null {
  const status = resolveHomeThreadStatus(thread, descendants);
  if (status.indicator === "waiting-for-input") return "waiting";
  if (status.indicator === "unread-error") return "failed";
  if (status.indicator === "queued-failed") return "failed";
  if (status.isWorking) return "working";
  if (status.indicator === "unread-success") return "done";
  return null;
}
