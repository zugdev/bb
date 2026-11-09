import type { ThreadListEntry } from "@bb/domain";
import {
  liveThreadDescendants,
  threadDot,
} from "@/components/thread/thread-dot";

export interface InboxSections {
  needsAnswer: ThreadListEntry[];
  waitingOnYou: ThreadListEntry[];
  working: ThreadListEntry[];
  snoozed: ThreadListEntry[];
}

export function isSnoozed(thread: ThreadListEntry, now: number): boolean {
  return thread.snoozedUntil !== null && thread.snoozedUntil > now;
}

function arrivedAt(thread: ThreadListEntry): number {
  return Math.max(thread.latestAttentionAt, thread.snoozedUntil ?? 0);
}

function byArrival(a: ThreadListEntry, b: ThreadListEntry): number {
  return arrivedAt(a) - arrivedAt(b);
}

export function inboxSections(
  threads: Iterable<ThreadListEntry>,
  now: number,
): InboxSections {
  const list = [...threads];
  const descendants = liveThreadDescendants(list);
  const sections: InboxSections = {
    needsAnswer: [],
    waitingOnYou: [],
    working: [],
    snoozed: [],
  };
  for (const thread of list) {
    if (
      thread.parentThreadId !== null ||
      thread.archivedAt !== null ||
      thread.deletedAt !== null ||
      thread.visibility !== "visible"
    ) {
      continue;
    }
    const dot = threadDot(thread, descendants);
    if (dot === "waiting") sections.needsAnswer.push(thread);
    else if (isSnoozed(thread, now)) sections.snoozed.push(thread);
    else if (dot === "working") sections.working.push(thread);
    else if (thread.latestAttentionAt > (thread.lastUserMessageAt ?? 0)) {
      sections.waitingOnYou.push(thread);
    }
  }
  sections.needsAnswer.sort(byArrival);
  sections.waitingOnYou.sort(byArrival);
  sections.working.sort((a, b) => b.updatedAt - a.updatedAt);
  sections.snoozed.sort(
    (a, b) => (a.snoozedUntil ?? 0) - (b.snoozedUntil ?? 0),
  );
  return sections;
}

export function inboxQueue(sections: InboxSections): ThreadListEntry[] {
  return [...sections.needsAnswer, ...sections.waitingOnYou];
}

export function nextSnoozeWake(
  threads: Iterable<ThreadListEntry>,
  now: number,
): number | null {
  let next: number | null = null;
  for (const thread of threads) {
    const until = thread.snoozedUntil;
    if (until !== null && until > now && (next === null || until < next)) {
      next = until;
    }
  }
  return next;
}

export type InboxStep =
  | { kind: "stay" }
  | { kind: "open"; thread: ThreadListEntry }
  | { kind: "done" };

export function nextInboxStep(
  queue: readonly ThreadListEntry[],
  shownThreadId: string | null,
  trackedThreadId: string | null | undefined,
): InboxStep {
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
