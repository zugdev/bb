import { useMemo, type ReactNode, type Ref } from "react";
import type {
  PluginSidebarProject,
  PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  lastMessageTime,
  latestThreads,
  liveThreadDescendants,
  NEEDS_YOU_LIMIT,
  needsYouThreads,
  recentProjects,
} from "./home-overview";
import { ThreadDescendantsContext, ThreadRow, type OpenThread } from "./ThreadRow";

export interface NewThreadOverviewProps {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  projectId: string | null;
  setProjectId: ((projectId: string | null) => void) | null;
  picker: ReactNode;
  cycleShortcutLabel: string | null;
  onOpenThread: OpenThread;
  rootRef?: Ref<HTMLDivElement>;
}

export function NewThreadOverview({
  threads,
  projects,
  projectId,
  setProjectId,
  picker,
  cycleShortcutLabel,
  onOpenThread,
  rootRef,
}: NewThreadOverviewProps) {
  const descendants = useMemo(() => liveThreadDescendants(threads), [threads]);
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
        ? threads
        : threads.filter((thread) => thread.projectId === selectedProject.id),
    [selectedProject, threads],
  );
  const needsYou = useMemo(
    () => needsYouThreads(projectThreads),
    [projectThreads],
  );
  const latest = useMemo(
    () =>
      selectedProject === null
        ? []
        : latestThreads(
            projectThreads,
            new Set(needsYou.map((thread) => thread.id)),
          ),
    [needsYou, projectThreads, selectedProject],
  );
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
          {recent.length === 0 || cycleShortcutLabel === null ? null : (
            <span
              className="text-xs text-muted-foreground/70"
              aria-hidden="true"
            >
              {cycleShortcutLabel}
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
        {latest.length === 0 ? null : (
          <section className="flex flex-col">
            <h2 className="pb-1.5 text-sm font-medium">Latest threads</h2>
            {latest.map((thread) => (
              <ThreadRow
                key={thread.id}
                thread={thread}
                projectName={null}
                time={lastMessageTime(thread)}
                onOpen={onOpenThread}
              />
            ))}
          </section>
        )}
      </div>
    </ThreadDescendantsContext>
  );
}
