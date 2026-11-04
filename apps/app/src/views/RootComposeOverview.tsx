import { useMemo } from "react";
import type { ThreadListEntry } from "@bb/domain";
import {
  ProjectSelector,
  type ProjectSelectorCreateProjectConfig,
  type ProjectSelectorOption,
} from "@/components/pickers/ProjectSelector";
import { homeAttention } from "./home-overview";
import { ThreadRow, type OpenThread } from "./HomeThreadRow";

export const ROOT_COMPOSE_NEEDS_YOU_LIMIT = 3;

interface ProjectThreads {
  threads: readonly ThreadListEntry[];
}

interface RootComposeOverviewProps {
  sidebarNavigation:
    | { personalProject: ProjectThreads; projects: readonly ProjectThreads[] }
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
}

export function RootComposeOverview({
  sidebarNavigation,
  projectNamesById,
  project,
  onOpenThread,
}: RootComposeOverviewProps) {
  const needsYou = useMemo(
    () =>
      sidebarNavigation === undefined
        ? []
        : homeAttention([
            sidebarNavigation.personalProject,
            ...sidebarNavigation.projects,
          ]).needsYou,
    [sidebarNavigation],
  );
  return (
    <div className="flex flex-col gap-6" data-testid="root-compose-overview">
      <ProjectSelector
        projects={project.options}
        value={project.value}
        onChange={project.onChange}
        allowNoProject
        variant="outline"
        createProject={project.createProject}
        disabled={project.disabled}
        isLoading={sidebarNavigation === undefined}
        className="self-start"
      />
      {needsYou.length === 0 ? null : (
        <section className="flex flex-col">
          <h2 className="flex items-baseline gap-2 pb-1.5 text-sm font-medium">
            Needs you
            <span className="text-xs font-normal text-muted-foreground tabular-nums">
              {needsYou.length}
            </span>
          </h2>
          {needsYou.slice(0, ROOT_COMPOSE_NEEDS_YOU_LIMIT).map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              projectName={projectNamesById.get(thread.projectId) ?? null}
              time={thread.latestAttentionAt}
              onOpen={onOpenThread}
            />
          ))}
        </section>
      )}
    </div>
  );
}
