import type { BbNavigate, PluginSidebarThread } from "@get-bb/plugin-sdk/app";

export const SIDEBAR_THREAD_OPTIONS = {
  experimental_lifecycles: ["active", "archived"],
} as const;

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

export function openParentInPane(navigate: BbNavigate, link: ParentLink): void {
  navigate.toThread(link.threadId, { experimental_inPane: true });
}

let narrowHeaders: ReadonlyMap<string, BbNavigate> = new Map();
const listeners = new Set<() => void>();

function publish(next: ReadonlyMap<string, BbNavigate>): void {
  narrowHeaders = next;
  for (const listener of listeners) listener();
}

export function markHeaderNarrow(
  threadId: string,
  navigate: BbNavigate,
): () => void {
  publish(new Map([...narrowHeaders, [threadId, navigate]]));
  return () => {
    if (narrowHeaders.get(threadId) !== navigate) return;
    const next = new Map(narrowHeaders);
    next.delete(threadId);
    publish(next);
  };
}

export function subscribeNarrowHeaders(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getNarrowHeaders(): ReadonlyMap<string, BbNavigate> {
  return narrowHeaders;
}
