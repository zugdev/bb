import { useMemo, useState, type ReactNode, type Ref } from "react";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import type { ProjectPullRequest } from "bb-plugin-environment-git-worktree/pull-requests-contract";
import { PullRequestsSection } from "./PullRequestsSection";
import {
  archivableHomeThreads,
  filterHomeThreads,
  HOME_AGE_FILTERS,
  HOME_STATUS_FILTERS,
  homeTopLevelThreads,
  lastMessageTime,
  liveThreadDescendants,
  NEEDS_YOU_LIMIT,
  needsYouThreads,
  recentProjects,
  type HomeThreadFilter,
} from "./home-overview";
import { ProjectSection, type HomeThreadOrder } from "./ProjectSection";
import {
  ThreadDescendantsContext,
  ThreadRow,
  type OpenThread,
} from "./ThreadRow";

export interface NewThreadOverviewProps {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  projectId: string | null;
  setProjectId: ((projectId: string | null) => void) | null;
  picker: ReactNode;
  cycleShortcutLabel: string | null;
  order: HomeThreadOrder;
  filter: HomeThreadFilter;
  setFilter: (filter: HomeThreadFilter) => void;
  onArchiveThreads: (threads: readonly PluginSidebarThread[]) => Promise<void>;
  pullRequests: readonly ProjectPullRequest[];
  onSelectPullRequest: (pr: ProjectPullRequest) => void;
  onOpenThread: OpenThread;
  rootRef?: Ref<HTMLDivElement>;
}

const PILL_CLASS =
  "h-7 max-w-40 truncate rounded-full border px-2.5 text-xs transition-colors";

function pillClass(selected: boolean) {
  return cn(
    PILL_CLASS,
    selected
      ? "border-foreground/30 bg-accent text-foreground"
      : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
  );
}

export function NewThreadOverview({
  threads,
  projects,
  projectId,
  setProjectId,
  picker,
  cycleShortcutLabel,
  order,
  filter,
  setFilter,
  onArchiveThreads,
  pullRequests,
  onSelectPullRequest,
  onOpenThread,
  rootRef,
}: NewThreadOverviewProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const descendants = useMemo(() => liveThreadDescendants(threads), [threads]);
  const filteredThreads = useMemo(
    () => filterHomeThreads(threads, filter, Date.now()),
    [filter, threads],
  );
  const recent = useMemo(
    () => recentProjects(projects, threads),
    [projects, threads],
  );
  const selectedProject =
    projectId === null
      ? null
      : (projects.find((project) => project.id === projectId) ?? null);
  const projectThreads = useMemo(
    () =>
      selectedProject === null
        ? filteredThreads
        : filteredThreads.filter(
            (thread) => thread.projectId === selectedProject.id,
          ),
    [selectedProject, filteredThreads],
  );
  const archivable = useMemo(
    () =>
      filter.olderThanDays === null ? [] : archivableHomeThreads(projectThreads),
    [filter.olderThanDays, projectThreads],
  );
  const needsYou = useMemo(
    () => needsYouThreads(projectThreads),
    [projectThreads],
  );
  const projectSections = useMemo(() => {
    const listed = selectedProject === null ? projects : [selectedProject];
    const latestByProject = new Map<string, number>();
    const threadsByProject = new Map<string, PluginSidebarThread[]>();
    const waiting = new Set(needsYou.map((thread) => thread.id));
    for (const thread of homeTopLevelThreads(projectThreads)) {
      if (waiting.has(thread.id)) continue;
      threadsByProject.set(thread.projectId, [
        ...(threadsByProject.get(thread.projectId) ?? []),
        thread,
      ]);
      latestByProject.set(
        thread.projectId,
        Math.max(
          latestByProject.get(thread.projectId) ?? 0,
          lastMessageTime(thread),
        ),
      );
    }
    return listed
      .filter(
        (project) =>
          selectedProject !== null || threadsByProject.has(project.id),
      )
      .sort(
        (a, b) =>
          (latestByProject.get(b.id) ?? 0) - (latestByProject.get(a.id) ?? 0),
      )
      .map((project) => ({
        project,
        threads: threadsByProject.get(project.id) ?? [],
      }));
  }, [needsYou, projectThreads, projects, selectedProject]);
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const showsProjectName = selectedProject === null;
  return (
    <ThreadDescendantsContext value={descendants}>
      <div
        ref={rootRef}
        className="flex flex-col gap-6"
        data-testid="root-compose-overview"
      >
        <div className="flex flex-wrap items-center gap-1.5">
          {picker}
          {recent.map((option) => {
            const selected = option.id === projectId;
            return (
              <button
                key={option.id}
                type="button"
                aria-pressed={selected}
                disabled={setProjectId === null}
                onClick={() => setProjectId?.(option.id)}
                className={pillClass(selected)}
              >
                {option.name}
              </button>
            );
          })}
          {recent.length === 0 || cycleShortcutLabel === null ? null : (
            <span
              className="text-xs text-muted-foreground/70"
              aria-hidden="true"
            >
              {cycleShortcutLabel}
            </span>
          )}
        </div>
        <div
          role="group"
          aria-label="Thread filters"
          className="-mt-3 flex flex-wrap items-center gap-1.5"
        >
          {HOME_STATUS_FILTERS.map((option) => (
            <button
              key={option.value}
              type="button"
              aria-pressed={filter.status === option.value}
              onClick={() => setFilter({ ...filter, status: option.value })}
              className={pillClass(filter.status === option.value)}
            >
              {option.label}
            </button>
          ))}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          {HOME_AGE_FILTERS.map((option) => (
            <button
              key={option.label}
              type="button"
              aria-pressed={filter.olderThanDays === option.value}
              onClick={() =>
                setFilter({ ...filter, olderThanDays: option.value })
              }
              className={pillClass(filter.olderThanDays === option.value)}
            >
              {option.label}
            </button>
          ))}
          {archivable.length === 0 ? null : (
            <button
              type="button"
              disabled={isArchiving}
              onClick={() => {
                setIsArchiving(true);
                void onArchiveThreads(archivable).finally(() =>
                  setIsArchiving(false),
                );
              }}
              className={cn(pillClass(false), "ml-auto")}
            >
              Archive {archivable.length} idle
            </button>
          )}
        </div>
        {needsYou.length === 0 && selectedProject === null ? null : (
          <section className="flex flex-col">
            <h2 className="flex items-baseline gap-2 pb-1.5 text-sm font-medium">
              Needs you
              {needsYou.length === 0 ? null : (
                <span className="text-xs font-normal text-muted-foreground tabular-nums">
                  {needsYou.length}
                </span>
              )}
            </h2>
            {needsYou.length === 0 ? (
              <p className="text-sm text-muted-foreground">Nothing waiting</p>
            ) : (
              needsYou
                .slice(0, NEEDS_YOU_LIMIT)
                .map((thread) => (
                  <ThreadRow
                    key={thread.id}
                    thread={thread}
                    projectName={
                      showsProjectName
                        ? (projectNames.get(thread.projectId) ?? null)
                        : null
                    }
                    time={thread.latestAttentionAt}
                    onOpen={onOpenThread}
                  />
                ))
            )}
          </section>
        )}
        {projectSections.map(({ project, threads: sectionThreads }) => (
          <ProjectSection
            key={project.id}
            project={project}
            threads={sectionThreads}
            order={order}
            onOpen={onOpenThread}
            onNewThread={() => setProjectId?.(project.id)}
          />
        ))}
        {selectedProject === null || pullRequests.length === 0 ? null : (
          <PullRequestsSection
            pullRequests={pullRequests}
            onSelect={onSelectPullRequest}
          />
        )}
      </div>
    </ThreadDescendantsContext>
  );
}
