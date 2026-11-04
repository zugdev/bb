import { useMemo, useRef } from "react";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  useAppCommandHandler,
  useAppCommandShortcut,
} from "@/components/commands/AppCommandProvider";
import type { ThreadListEntry } from "@bb/domain";
import {
  ProjectSelector,
  type ProjectSelectorCreateProjectConfig,
  type ProjectSelectorOption,
} from "@/components/pickers/ProjectSelector";
import {
  homeAttention,
  homeThreadTime,
  liveThreadDescendants,
  NO_THREAD_DESCENDANTS,
  sortAndFilterHomeThreads,
} from "./home-overview";
import {
  HomeThreadDescendantsContext,
  ThreadRow,
  type OpenThread,
} from "./HomeThreadRow";

export const ROOT_COMPOSE_NEEDS_YOU_LIMIT = 3;
export const ROOT_COMPOSE_RECENT_PROJECT_LIMIT = 4;
export const ROOT_COMPOSE_PROJECT_THREAD_LIMIT = 4;

interface ProjectThreads {
  threads: readonly ThreadListEntry[];
}

interface NamedProjectThreads extends ProjectThreads {
  id: string;
  name: string;
}

export function recentProjects(
  projects: readonly NamedProjectThreads[],
): { id: string; name: string }[] {
  return projects
    .map((project) => ({
      id: project.id,
      name: project.name,
      lastUserMessageAt: Math.max(
        0,
        ...project.threads.map((thread) => thread.lastUserMessageAt ?? 0),
      ),
    }))
    .filter((project) => project.lastUserMessageAt > 0)
    .sort((a, b) => b.lastUserMessageAt - a.lastUserMessageAt)
    .slice(0, ROOT_COMPOSE_RECENT_PROJECT_LIMIT)
    .map(({ id, name }) => ({ id, name }));
}

interface RootComposeOverviewProps {
  sidebarNavigation:
    | {
        personalProject: ProjectThreads & { id: string };
        projects: readonly NamedProjectThreads[];
      }
    | undefined;
  projectNamesById: ReadonlyMap<string, string>;
  project: {
    options: readonly ProjectSelectorOption[];
    value: string | null;
    onChange: (projectId: string | null) => void;
    createProject: ProjectSelectorCreateProjectConfig;
    disabled: boolean;
  };
  onOpenThread: OpenThread;
  isFocusedPane: boolean;
}

export function RootComposeOverview(props: RootComposeOverviewProps) {
  const { sidebarNavigation } = props;
  const descendants = useMemo(
    () =>
      sidebarNavigation === undefined
        ? NO_THREAD_DESCENDANTS
        : liveThreadDescendants(
            [
              sidebarNavigation.personalProject,
              ...sidebarNavigation.projects,
            ].flatMap((candidate) => candidate.threads),
          ),
    [sidebarNavigation],
  );
  return (
    <HomeThreadDescendantsContext value={descendants}>
      <RootComposeOverviewSections {...props} />
    </HomeThreadDescendantsContext>
  );
}

function RootComposeOverviewSections({
  sidebarNavigation,
  projectNamesById,
  project,
  onOpenThread,
  isFocusedPane,
}: RootComposeOverviewProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const recent = useMemo(
    () =>
      sidebarNavigation === undefined
        ? []
        : recentProjects(sidebarNavigation.projects),
    [sidebarNavigation],
  );
  const cycleShortcut = useAppCommandShortcut("composer.cycleProject");
  useAppCommandHandler(
    "composer.cycleProject",
    () => {
      if (rootRef.current?.closest("[inert]")) return false;
      const choices = [null, ...recent.map((option) => option.id)];
      const next =
        choices[(choices.indexOf(project.value) + 1) % choices.length];
      project.onChange(next ?? null);
      return true;
    },
    0,
    isFocusedPane && !project.disabled,
  );
  const selectedProject = useMemo(
    () =>
      project.value === null || sidebarNavigation === undefined
        ? null
        : ([
            sidebarNavigation.personalProject,
            ...sidebarNavigation.projects,
          ].find((candidate) => candidate.id === project.value) ?? null),
    [project.value, sidebarNavigation],
  );
  const needsYou = useMemo(
    () =>
      sidebarNavigation === undefined
        ? []
        : homeAttention(
            selectedProject === null
              ? [
                  sidebarNavigation.personalProject,
                  ...sidebarNavigation.projects,
                ]
              : [selectedProject],
          ).needsYou,
    [selectedProject, sidebarNavigation],
  );
  const latest = useMemo(() => {
    if (selectedProject === null) return [];
    const waiting = new Set(needsYou.map((thread) => thread.id));
    return sortAndFilterHomeThreads(selectedProject.threads, "message", "")
      .filter((thread) => !waiting.has(thread.id))
      .slice(0, ROOT_COMPOSE_PROJECT_THREAD_LIMIT);
  }, [needsYou, selectedProject]);
  const showsProjectName = selectedProject === null;
  return (
    <div
      ref={rootRef}
      className="flex flex-col gap-6"
      data-testid="root-compose-overview"
    >
      <div className="flex flex-wrap items-center gap-1.5">
        <ProjectSelector
          projects={project.options}
          value={project.value}
          onChange={project.onChange}
          allowNoProject
          variant="outline"
          createProject={project.createProject}
          disabled={project.disabled}
          isLoading={sidebarNavigation === undefined}
        />
        {recent.map((option) => {
          const selected = option.id === project.value;
          return (
            <button
              key={option.id}
              type="button"
              aria-pressed={selected}
              disabled={project.disabled}
              onClick={() => project.onChange(option.id)}
              className={cn(
                "h-7 max-w-40 truncate rounded-full border px-2.5 text-xs transition-colors",
                selected
                  ? "border-foreground/30 bg-accent text-foreground"
                  : "border-transparent text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
            >
              {option.name}
            </button>
          );
        })}
        {recent.length === 0 || cycleShortcut === null ? null : (
          <span className="text-xs text-muted-foreground/70" aria-hidden="true">
            {cycleShortcut.label}
          </span>
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
              .slice(0, ROOT_COMPOSE_NEEDS_YOU_LIMIT)
              .map((thread) => (
                <ThreadRow
                  key={thread.id}
                  thread={thread}
                  projectName={
                    showsProjectName
                      ? (projectNamesById.get(thread.projectId) ?? null)
                      : null
                  }
                  time={thread.latestAttentionAt}
                  onOpen={onOpenThread}
                />
              ))
          )}
        </section>
      )}
      {latest.length === 0 ? null : (
        <section className="flex flex-col">
          <h2 className="pb-1.5 text-sm font-medium">Latest threads</h2>
          {latest.map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              projectName={null}
              time={homeThreadTime(thread, "message")}
              onOpen={onOpenThread}
            />
          ))}
        </section>
      )}
    </div>
  );
}
