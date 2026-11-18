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
  lastMessageTime,
  liveThreadDescendants,
  recentProjects,
  type HomeThreadFilter,
} from "./home-overview";
import { ProjectSection, type HomeThreadOrder } from "./ProjectSection";
import {
  ThreadDescendantsContext,
  type OpenThread,
} from "./ThreadRow";

export interface NewThreadOverviewProps {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  projectId: string | null;
  setProjectId: ((projectId: string | null) => void) | null;
  order: HomeThreadOrder;
  filter: HomeThreadFilter;
  setFilter: ((filter: HomeThreadFilter) => void) | null;
  showArchived: boolean;
  onArchiveThreads: (threads: readonly PluginSidebarThread[]) => Promise<void>;
  pullRequests: readonly ProjectPullRequest[] | null;
  pullRequestsExpanded: boolean;
  setPullRequestsExpanded: (expanded: boolean) => void;
  onSelectPullRequest: (pr: ProjectPullRequest) => void;
  onOpenThread: OpenThread;
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

export interface ProjectChipsProps {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  projectId: string | null;
  setProjectId: ((projectId: string | null) => void) | null;
  picker: ReactNode;
  cycleShortcutLabel: string | null;
  showArchived: boolean;
  setShowArchived: (showArchived: boolean) => void;
  rootRef?: Ref<HTMLDivElement>;
}

export function ProjectChips({
  threads,
  projects,
  projectId,
  setProjectId,
  picker,
  cycleShortcutLabel,
  showArchived,
  setShowArchived,
  rootRef,
}: ProjectChipsProps) {
  const recent = useMemo(
    () => recentProjects(projects, threads),
    [projects, threads],
  );
  return (
    <div ref={rootRef} className="flex flex-wrap items-center gap-1.5">
      {picker}
      <button
        type="button"
        aria-pressed={projectId === null}
        disabled={setProjectId === null}
        onClick={() => setProjectId?.(null)}
        className={pillClass(projectId === null)}
      >
        No project
      </button>
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
          className="text-xs text-muted-foreground/70 pointer-coarse:hidden"
          aria-hidden="true"
        >
          {cycleShortcutLabel}
        </span>
      )}
      <button
        type="button"
        aria-pressed={showArchived}
        onClick={() => setShowArchived(!showArchived)}
        className={cn(pillClass(showArchived), "ml-auto")}
      >
        Archived
      </button>
    </div>
  );
}

export function NewThreadOverview({
  threads,
  projects,
  projectId,
  setProjectId,
  order,
  filter,
  setFilter,
  showArchived,
  onArchiveThreads,
  pullRequests,
  pullRequestsExpanded,
  setPullRequestsExpanded,
  onSelectPullRequest,
  onOpenThread,
}: NewThreadOverviewProps) {
  const [isArchiving, setIsArchiving] = useState(false);
  const descendants = useMemo(() => liveThreadDescendants(threads), [threads]);
  const filteredThreads = useMemo(
    () => filterHomeThreads(threads, filter, Date.now()),
    [filter, threads],
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
      filter.olderThanDays === null
        ? []
        : archivableHomeThreads(projectThreads),
    [filter.olderThanDays, projectThreads],
  );
  const projectSections = useMemo(() => {
    const listed = selectedProject === null ? projects : [selectedProject];
    const latestByProject = new Map<string, number>();
    const threadsByProject = new Map<string, PluginSidebarThread[]>();
    for (const thread of projectThreads) {
      if (thread.parentThreadId !== null) continue;
      if (thread.archivedAt !== null && !showArchived) continue;
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
  }, [projectThreads, projects, selectedProject, showArchived]);
  return (
    <ThreadDescendantsContext value={descendants}>
      <div
        className="flex flex-col gap-6"
        data-testid="root-compose-overview"
      >
        {setFilter === null ? null : (
          <div
            role="group"
            aria-label="Thread filters"
            className="flex flex-wrap items-center gap-1.5"
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
        {selectedProject === null ? null : (
          <PullRequestsSection
            pullRequests={pullRequests}
            expanded={pullRequestsExpanded}
            setExpanded={setPullRequestsExpanded}
            onSelect={onSelectPullRequest}
          />
        )}
      </div>
    </ThreadDescendantsContext>
  );
}
