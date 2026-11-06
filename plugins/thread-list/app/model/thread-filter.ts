import type { ThreadFilter } from "../../shared/preferences.js";
import type { SidebarProject } from "./use-sidebar-data.js";
import type { SidebarThread } from "./sidebar-thread.js";

const DAY_MS = 86_400_000;
const BUSY_STATUSES: ReadonlySet<string> = new Set([
  "starting",
  "active",
  "stopping",
]);

export function isThreadFilterActive(filter: ThreadFilter): boolean {
  return (
    filter.status !== "all" ||
    filter.projectId !== null ||
    filter.olderThanDays !== null
  );
}

export function isRunningThread(thread: SidebarThread): boolean {
  return (
    BUSY_STATUSES.has(thread.status) || thread.runtimeStatus === "provisioning"
  );
}

export function threadNeedsUser(thread: SidebarThread): boolean {
  return (
    thread.hasPendingInteraction ||
    thread.isUnread ||
    thread.queuedWork === "failed"
  );
}

export function matchesThreadFilter(
  thread: SidebarThread,
  filter: ThreadFilter,
  now: number,
): boolean {
  if (filter.projectId !== null && thread.projectId !== filter.projectId) {
    return false;
  }
  if (filter.status === "running" && !isRunningThread(thread)) return false;
  if (filter.status === "needs-you" && !threadNeedsUser(thread)) return false;
  if (
    filter.olderThanDays !== null &&
    now - thread.updatedAt < filter.olderThanDays * DAY_MS
  ) {
    return false;
  }
  return true;
}

export function filterSidebarProjects(
  projects: SidebarProject[],
  filter: ThreadFilter,
  now: number,
): SidebarProject[] {
  if (!isThreadFilterActive(filter)) return projects;
  return projects.flatMap((project) => {
    if (filter.projectId !== null && project.id !== filter.projectId) return [];
    const threads = project.threads.filter((thread) =>
      matchesThreadFilter(thread, filter, now),
    );
    return threads.length === 0 ? [] : [{ ...project, threads }];
  });
}
