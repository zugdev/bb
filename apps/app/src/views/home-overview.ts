import type { ThreadListEntry } from "@bb/domain";
import { experimental_resolveThreadStatus } from "@get-bb/plugin-sdk/internal/thread-status";
import { toThreadStatusThread } from "@/lib/plugin-sidebar-threads";
import { getThreadDisplayTitle } from "@/lib/thread-title";

export interface HomeThread {
  thread: ThreadListEntry;
  label: string | null;
}

export interface ProjectOverview {
  needsYou: HomeThread[];
  running: HomeThread[];
  unread: HomeThread[];
  quiet: HomeThread[];
}

const NEEDS_YOU_INDICATORS = new Set([
  "unread-error",
  "waiting-for-input",
  "queued-failed",
]);

export function homeTopLevelThreads(
  threads: readonly ThreadListEntry[],
): ThreadListEntry[] {
  return threads.filter(
    (thread) => thread.parentThreadId === null && thread.archivedAt === null,
  );
}

export type HomeThreadDot = "working" | "done" | "waiting" | "failed";

function resolveHomeThreadStatus(thread: ThreadListEntry) {
  return experimental_resolveThreadStatus({
    thread: toThreadStatusThread(thread),
    hiddenThreads: [],
    hasUnsubmittedDraft: false,
    rowStatus: null,
  });
}

export function homeThreadDot(thread: ThreadListEntry): HomeThreadDot | null {
  const status = resolveHomeThreadStatus(thread);
  if (status.indicator === "waiting-for-input") return "waiting";
  if (status.indicator === "unread-error") return "failed";
  if (status.indicator === "queued-failed") return "failed";
  if (status.isWorking) return "working";
  if (status.indicator === "unread-success") return "done";
  return null;
}

export function overviewProjectThreads(
  threads: readonly ThreadListEntry[],
): ProjectOverview {
  const overview: ProjectOverview = {
    needsYou: [],
    running: [],
    unread: [],
    quiet: [],
  };
  const topLevel = homeTopLevelThreads(threads).sort(
    (a, b) => b.latestAttentionAt - a.latestAttentionAt,
  );
  for (const thread of topLevel) {
    const status = resolveHomeThreadStatus(thread);
    const item = { thread, label: status.label };
    if (NEEDS_YOU_INDICATORS.has(status.indicator))
      overview.needsYou.push(item);
    else if (status.isWorking) overview.running.push(item);
    else if (status.indicator === "unread-success") overview.unread.push(item);
    else overview.quiet.push(item);
  }
  return overview;
}

export function homeAttention(
  projects: readonly { threads: readonly ThreadListEntry[] }[],
): { needsYou: ThreadListEntry[]; replies: ThreadListEntry[] } {
  const overviews = projects.map((project) =>
    overviewProjectThreads(project.threads),
  );
  const byAttention = (a: ThreadListEntry, b: ThreadListEntry) =>
    b.latestAttentionAt - a.latestAttentionAt;
  return {
    needsYou: overviews
      .flatMap((o) => o.needsYou.map((item) => item.thread))
      .sort(byAttention),
    replies: overviews
      .flatMap((o) => o.unread.map((item) => item.thread))
      .sort(byAttention),
  };
}

export const HOME_THREAD_SORTS = [
  { value: "message", label: "Your last message" },
  { value: "activity", label: "Last activity" },
  { value: "created", label: "Created" },
] as const;

export type HomeThreadSort = (typeof HOME_THREAD_SORTS)[number]["value"];

export function homeThreadTime(
  thread: ThreadListEntry,
  sort: HomeThreadSort,
): number {
  if (sort === "activity") return thread.latestAttentionAt;
  if (sort === "created") return thread.createdAt;
  return thread.lastUserMessageAt ?? thread.createdAt;
}

export function sortAndFilterHomeThreads(
  threads: readonly ThreadListEntry[],
  sort: HomeThreadSort,
  query: string,
  isOldestFirst = false,
): ThreadListEntry[] {
  const needle = query.trim().toLowerCase();
  const direction = isOldestFirst ? -1 : 1;
  return homeTopLevelThreads(threads)
    .filter(
      (thread) =>
        needle.length === 0 ||
        getThreadDisplayTitle(thread).toLowerCase().includes(needle),
    )
    .sort(
      (a, b) => direction * (homeThreadTime(b, sort) - homeThreadTime(a, sort)),
    );
}

export const HOME_FIXED_SECTION_IDS = ["attention"];

export interface HomeLayoutPrefs {
  order: string[];
  hidden: string[];
}

export const DEFAULT_HOME_LAYOUT: HomeLayoutPrefs = { order: [], hidden: [] };

export function isHomeLayoutPrefs(value: unknown): value is HomeLayoutPrefs {
  if (typeof value !== "object" || value === null) return false;
  const { order, hidden } = value as Record<string, unknown>;
  return (
    Array.isArray(order) &&
    Array.isArray(hidden) &&
    [...order, ...hidden].every((id) => typeof id === "string")
  );
}

export function projectSectionId(projectId: string): string {
  return `project:${projectId}`;
}

export function pluginSectionId(pluginId: string, sectionId: string): string {
  return `plugin:${pluginId}/${sectionId}`;
}

export function resolveHomeSections(
  prefs: HomeLayoutPrefs,
  projectIds: readonly string[],
  pluginSectionIds: readonly string[] = [],
): { visible: string[]; hidden: string[] } {
  const leading = [...HOME_FIXED_SECTION_IDS, ...pluginSectionIds];
  const available = [...leading, ...projectIds.map(projectSectionId)];
  const unsaved = available.filter((id) => !prefs.order.includes(id));
  const ordered = [
    ...unsaved.filter((id) => leading.includes(id)),
    ...prefs.order.filter((id) => available.includes(id)),
    ...unsaved.filter((id) => !leading.includes(id)),
  ];
  const hidden = new Set(prefs.hidden);
  return {
    visible: ordered.filter((id) => !hidden.has(id)),
    hidden: ordered.filter((id) => hidden.has(id)),
  };
}

export function moveHomeSection(
  prefs: HomeLayoutPrefs,
  visible: readonly string[],
  activeId: string,
  overId: string,
): HomeLayoutPrefs {
  const from = visible.indexOf(activeId);
  const to = visible.indexOf(overId);
  if (from === -1 || to === -1 || from === to) return prefs;
  const order = [...visible];
  order.splice(to, 0, ...order.splice(from, 1));
  return { order: [...order, ...prefs.hidden], hidden: prefs.hidden };
}

export function setHomeSectionHidden(
  prefs: HomeLayoutPrefs,
  visible: readonly string[],
  id: string,
  isHidden: boolean,
): HomeLayoutPrefs {
  const hidden = prefs.hidden.filter((hiddenId) => hiddenId !== id);
  return {
    order: isHidden ? [...visible, ...hidden] : [...visible, id, ...hidden],
    hidden: isHidden ? [...hidden, id] : hidden,
  };
}

export function repoWebUrl(gitRemoteUrl: string | null): string | null {
  if (gitRemoteUrl === null) return null;
  const ssh = /^[^@]+@([^:]+):(.+?)(?:\.git)?$/.exec(gitRemoteUrl);
  if (ssh) return `https://${ssh[1]}/${ssh[2]}`;
  try {
    const url = new URL(gitRemoteUrl);
    return `https://${url.host}${url.pathname.replace(/\.git$/, "")}`;
  } catch {
    return null;
  }
}
