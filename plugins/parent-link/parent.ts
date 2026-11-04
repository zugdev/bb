import type {
  ExperimentalThreadHeaderLeadingProps,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

export interface ParentLink {
  threadId: string;
  projectId: string;
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
    projectId: related.projectId,
    displayTitle: related.displayTitle,
    href: related.href,
    relationship,
  };
}

export function parentMenuLabel(link: ParentLink): string {
  const target = link.relationship === "fork" ? "fork source" : "parent";
  return `Go to ${target}: ${link.displayTitle}`;
}

export type OpenThreadInPane =
  ExperimentalThreadHeaderLeadingProps["experimental_openThreadInPane"];

let narrowHeaders: ReadonlyMap<string, OpenThreadInPane> = new Map();
const listeners = new Set<() => void>();

function publish(next: ReadonlyMap<string, OpenThreadInPane>): void {
  narrowHeaders = next;
  for (const listener of listeners) listener();
}

export function markHeaderNarrow(
  threadId: string,
  openThreadInPane: OpenThreadInPane,
): () => void {
  publish(new Map([...narrowHeaders, [threadId, openThreadInPane]]));
  return () => {
    if (narrowHeaders.get(threadId) !== openThreadInPane) return;
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

export function getNarrowHeaders(): ReadonlyMap<string, OpenThreadInPane> {
  return narrowHeaders;
}
