import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export interface ParentLink {
  threadId: string;
  displayTitle: string;
  href: string;
  relationship: "parent" | "fork";
}

export function findParentLink(
  threads: readonly PluginSidebarThread[],
  threadId: string,
): ParentLink | null {
  const thread = threads.find((candidate) => candidate.id === threadId);
  if (thread === undefined) return null;
  const relatedId =
    thread.originKind === null
      ? thread.parentThreadId
      : (thread.sourceThreadId ?? thread.parentThreadId);
  if (relatedId === null) return null;
  const relationship = thread.originKind === "fork" ? "fork" : "parent";
  const related = threads.find((candidate) => candidate.id === relatedId);
  if (
    related === undefined ||
    related.isArchived ||
    (relationship === "fork" && related.projectId !== thread.projectId)
  ) {
    return null;
  }
  return {
    threadId: related.id,
    displayTitle: related.displayTitle,
    href: related.href,
    relationship,
  };
}

export function parentMenuLabel(link: ParentLink): string {
  const target = link.relationship === "fork" ? "fork source" : "parent";
  return `Go to ${target}: ${link.displayTitle}`;
}

let narrowThreadIds: ReadonlySet<string> = new Set();
const listeners = new Set<() => void>();

function publish(next: ReadonlySet<string>): void {
  narrowThreadIds = next;
  for (const listener of listeners) listener();
}

export function markHeaderNarrow(threadId: string): () => void {
  publish(new Set([...narrowThreadIds, threadId]));
  return () => {
    const next = new Set(narrowThreadIds);
    next.delete(threadId);
    publish(next);
  };
}

export function subscribeNarrowThreadIds(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNarrowThreadIds(): ReadonlySet<string> {
  return narrowThreadIds;
}
