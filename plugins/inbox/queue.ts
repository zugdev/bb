import {
  experimental_resolveThreadStatus,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

const SIDE_CHAT_PLUGIN_ID = "side-chat";

export type ThreadDot = "working" | "done" | "waiting" | "failed";

export type ThreadDescendants = (threadId: string) => PluginSidebarThread[];

export interface InboxSections {
  needsAnswer: PluginSidebarThread[];
  waitingOnYou: PluginSidebarThread[];
  working: PluginSidebarThread[];
  snoozed: PluginSidebarThread[];
}

export type InboxStep =
  | { kind: "stay" }
  | { kind: "open"; thread: PluginSidebarThread }
  | { kind: "done" };

function countsTowardParentStatus(thread: PluginSidebarThread): boolean {
  return (
    thread.archivedAt === null &&
    !(thread.isHidden && thread.originPluginId === SIDE_CHAT_PLUGIN_ID)
  );
}

export function liveThreadDescendants(
  threads: Iterable<PluginSidebarThread>,
): ThreadDescendants {
  const childrenByParentId = new Map<string, PluginSidebarThread[]>();
  for (const thread of threads) {
    if (thread.parentThreadId === null || !countsTowardParentStatus(thread))
      continue;
    const siblings = childrenByParentId.get(thread.parentThreadId);
    if (siblings === undefined)
      childrenByParentId.set(thread.parentThreadId, [thread]);
    else siblings.push(thread);
  }
  return (threadId) => {
    const descendants: PluginSidebarThread[] = [];
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

export function threadDot(
  thread: PluginSidebarThread,
  descendants: ThreadDescendants,
): ThreadDot | null {
  const status = experimental_resolveThreadStatus({
    thread,
    hiddenThreads: descendants(thread.id),
    hasUnsubmittedDraft: false,
    rowStatus: null,
  });
  if (status.indicator === "waiting-for-input") return "waiting";
  if (status.indicator === "unread-error") return "failed";
  if (status.indicator === "queued-failed") return "failed";
  if (status.isWorking) return "working";
  if (status.indicator === "unread-success") return "done";
  return null;
}

export function isSnoozed(thread: PluginSidebarThread, now: number): boolean {
  return (
    thread.experimental_snoozedUntil !== null &&
    thread.experimental_snoozedUntil > now
  );
}

export function arrivedAt(thread: PluginSidebarThread): number {
  return Math.max(
    thread.latestAttentionAt,
    thread.experimental_snoozedUntil ?? 0,
  );
}

function byArrival(a: PluginSidebarThread, b: PluginSidebarThread): number {
  return arrivedAt(a) - arrivedAt(b);
}

export function inboxSections(
  threads: readonly PluginSidebarThread[],
  now: number,
): InboxSections {
  const descendants = liveThreadDescendants(threads);
  const sections: InboxSections = {
    needsAnswer: [],
    waitingOnYou: [],
    working: [],
    snoozed: [],
  };
  for (const thread of threads) {
    if (
      thread.parentThreadId !== null ||
      thread.archivedAt !== null ||
      thread.isHidden
    ) {
      continue;
    }
    const dot = threadDot(thread, descendants);
    if (dot === "waiting") sections.needsAnswer.push(thread);
    else if (isSnoozed(thread, now)) sections.snoozed.push(thread);
    else if (dot === "working") sections.working.push(thread);
    else if (
      thread.latestAttentionAt > (thread.experimental_lastUserMessageAt ?? 0)
    ) {
      sections.waitingOnYou.push(thread);
    }
  }
  sections.needsAnswer.sort(byArrival);
  sections.waitingOnYou.sort(byArrival);
  sections.working.sort((a, b) => b.updatedAt - a.updatedAt);
  sections.snoozed.sort(
    (a, b) =>
      (a.experimental_snoozedUntil ?? 0) - (b.experimental_snoozedUntil ?? 0),
  );
  return sections;
}

export function inboxQueue(sections: InboxSections): PluginSidebarThread[] {
  return [...sections.needsAnswer, ...sections.waitingOnYou];
}

export function nextSnoozeWake(
  threads: readonly PluginSidebarThread[],
  now: number,
): number | null {
  let next: number | null = null;
  for (const thread of threads) {
    const until = thread.experimental_snoozedUntil;
    if (until !== null && until > now && (next === null || until < next)) {
      next = until;
    }
  }
  return next;
}

export function nextInboxStep(
  queue: readonly PluginSidebarThread[],
  shownThreadId: string | null,
  trackedThreadId: string | null | undefined,
  composerHasDraft: boolean,
): InboxStep {
  if (shownThreadId === null && composerHasDraft) return { kind: "stay" };
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

const HOUR_MS = 60 * 60 * 1000;
const TIME_FORMAT = new Intl.DateTimeFormat(undefined, {
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const DAY_FORMAT = new Intl.DateTimeFormat(undefined, { weekday: "short" });
const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  month: "short",
  day: "numeric",
});

function dayIndex(at: number): number {
  const date = new Date(at);
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()) /
      (24 * HOUR_MS),
  );
}

export function formatSnoozeWake(until: number, now: number): string {
  const time = TIME_FORMAT.format(until);
  const days = dayIndex(until) - dayIndex(now);
  if (days === 0) return time;
  if (days === 1) return `tomorrow ${time}`;
  if (days < 7) return `${DAY_FORMAT.format(until)} ${time}`;
  return `${DATE_FORMAT.format(until)} ${time}`;
}
