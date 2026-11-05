import {
  experimental_resolveThreadStatus,
  type PluginSidebarProject,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";

export const NEEDS_YOU_LIMIT = 3;
export const RECENT_PROJECT_LIMIT = 4;
export const PROJECT_THREAD_LIMIT = 4;

const SIDE_CHAT_PLUGIN_ID = "side-chat";

const NEEDS_YOU_INDICATORS = new Set([
  "unread-error",
  "waiting-for-input",
  "queued-failed",
]);

export type HomeThreadDot = "working" | "done" | "waiting" | "failed";

export type ThreadDescendants = (threadId: string) => PluginSidebarThread[];

export const NO_THREAD_DESCENDANTS: ThreadDescendants = () => [];

export function homeTopLevelThreads(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  return threads.filter(
    (thread) => thread.parentThreadId === null && thread.archivedAt === null,
  );
}

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

function resolveHomeThreadStatus(
  thread: PluginSidebarThread,
  descendants: ThreadDescendants,
) {
  return experimental_resolveThreadStatus({
    thread,
    hiddenThreads: descendants(thread.id),
    hasUnsubmittedDraft: false,
    rowStatus: null,
  });
}

export function homeThreadDot(
  thread: PluginSidebarThread,
  descendants: ThreadDescendants,
): HomeThreadDot | null {
  const status = resolveHomeThreadStatus(thread, descendants);
  if (status.indicator === "waiting-for-input") return "waiting";
  if (status.indicator === "unread-error") return "failed";
  if (status.indicator === "queued-failed") return "failed";
  if (status.isWorking) return "working";
  if (status.indicator === "unread-success") return "done";
  return null;
}

export function needsYouThreads(
  threads: readonly PluginSidebarThread[],
): PluginSidebarThread[] {
  const descendants = liveThreadDescendants(threads);
  return homeTopLevelThreads(threads)
    .filter((thread) =>
      NEEDS_YOU_INDICATORS.has(
        resolveHomeThreadStatus(thread, descendants).indicator,
      ),
    )
    .sort((a, b) => b.latestAttentionAt - a.latestAttentionAt);
}

export function lastMessageTime(thread: PluginSidebarThread): number {
  return thread.experimental_lastUserMessageAt ?? thread.createdAt;
}

export function latestThreads(
  threads: readonly PluginSidebarThread[],
  excluded: ReadonlySet<string>,
): PluginSidebarThread[] {
  return homeTopLevelThreads(threads)
    .sort((a, b) => lastMessageTime(b) - lastMessageTime(a))
    .filter((thread) => !excluded.has(thread.id))
    .slice(0, PROJECT_THREAD_LIMIT);
}

export function recentProjects(
  projects: readonly PluginSidebarProject[],
  threads: readonly PluginSidebarThread[],
): PluginSidebarProject[] {
  const lastMessageByProject = new Map<string, number>();
  for (const thread of threads) {
    const sentAt = thread.experimental_lastUserMessageAt ?? 0;
    if (sentAt > (lastMessageByProject.get(thread.projectId) ?? 0))
      lastMessageByProject.set(thread.projectId, sentAt);
  }
  return projects
    .filter(
      (project) =>
        !project.isPersonal && (lastMessageByProject.get(project.id) ?? 0) > 0,
    )
    .sort(
      (a, b) =>
        (lastMessageByProject.get(b.id) ?? 0) -
        (lastMessageByProject.get(a.id) ?? 0),
    )
    .slice(0, RECENT_PROJECT_LIMIT);
}

export function nextCycledProject(
  current: string | null,
  recent: readonly PluginSidebarProject[],
): string | null {
  const choices = [null, ...recent.map((project) => project.id)];
  return choices[(choices.indexOf(current) + 1) % choices.length] ?? null;
}

const MINUTE_MS = 60 * 1000;
const HOUR_MS = 60 * MINUTE_MS;
const DAY_MS = 24 * HOUR_MS;
const WEEK_MS = 7 * DAY_MS;

export function formatRelativeTime(timestamp: number, now: number): string {
  const diffMs = now - timestamp;
  if (diffMs < MINUTE_MS) return "just now";
  if (diffMs < HOUR_MS) return `${Math.floor(diffMs / MINUTE_MS)}m ago`;
  if (diffMs < DAY_MS) return `${Math.floor(diffMs / HOUR_MS)}h ago`;
  const days = Math.floor(diffMs / DAY_MS);
  if (days === 1) return "Yesterday";
  if (diffMs < WEEK_MS) return `${days}d ago`;
  if (diffMs < 5 * WEEK_MS) return `${Math.floor(diffMs / WEEK_MS)}w ago`;
  return new Date(timestamp).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

export function homeAttention(threads: readonly PluginSidebarThread[]): {
  needsYou: PluginSidebarThread[];
  replies: PluginSidebarThread[];
} {
  const descendants = liveThreadDescendants(threads);
  const byAttention = (a: PluginSidebarThread, b: PluginSidebarThread) =>
    b.latestAttentionAt - a.latestAttentionAt;
  const needsYou: PluginSidebarThread[] = [];
  const replies: PluginSidebarThread[] = [];
  for (const thread of homeTopLevelThreads(threads)) {
    const status = resolveHomeThreadStatus(thread, descendants);
    if (NEEDS_YOU_INDICATORS.has(status.indicator)) needsYou.push(thread);
    else if (!status.isWorking && status.indicator === "unread-success")
      replies.push(thread);
  }
  return { needsYou: needsYou.sort(byAttention), replies: replies.sort(byAttention) };
}

export const HOME_THREAD_SORTS = [
  { value: "message", label: "Your last message" },
  { value: "activity", label: "Last activity" },
  { value: "created", label: "Created" },
] as const;

export type HomeThreadSort = (typeof HOME_THREAD_SORTS)[number]["value"];

export function isHomeThreadSort(value: unknown): value is HomeThreadSort {
  return HOME_THREAD_SORTS.some((sort) => sort.value === value);
}

export function homeThreadTime(
  thread: PluginSidebarThread,
  sort: HomeThreadSort,
): number {
  if (sort === "activity") return thread.latestAttentionAt;
  if (sort === "created") return thread.createdAt;
  return lastMessageTime(thread);
}

export function sortAndFilterHomeThreads(
  threads: readonly PluginSidebarThread[],
  sort: HomeThreadSort,
  query: string,
  isOldestFirst = false,
): PluginSidebarThread[] {
  const needle = query.trim().toLowerCase();
  const direction = isOldestFirst ? -1 : 1;
  return homeTopLevelThreads(threads)
    .filter(
      (thread) =>
        needle.length === 0 ||
        thread.displayTitle.toLowerCase().includes(needle),
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
