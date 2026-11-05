import { useEffect, useMemo, useRef } from "react";
import {
  definePluginApp,
  experimental_ProjectPicker as ProjectPicker,
  experimental_useCommandShortcut,
  experimental_useSidebarThreads,
  useBbNavigate,
  type PluginComposerApi,
  type PluginHomepageSectionProps,
} from "@get-bb/plugin-sdk/app";
import { nextCycledProject, recentProjects } from "./home-overview";
import { NewThreadOverview } from "./NewThreadOverview";

export const CYCLE_PROJECT_COMMAND_ID = "cycle-project";

interface MountedOverview {
  root: { readonly current: HTMLElement | null };
  cycle: () => boolean;
}

const mountedOverviews = new Set<MountedOverview>();

export function cycleProjectFromComposer(composer: PluginComposerApi): boolean {
  if (composer.scope.kind !== "new-thread") return false;
  for (const overview of mountedOverviews) {
    const root = overview.root.current;
    if (root === null || root.closest("[inert]") !== null) continue;
    if (overview.cycle()) return true;
  }
  return false;
}

function NewThreadOverviewSection({
  projectId,
  experimental_setProjectId: setProjectId,
}: PluginHomepageSectionProps) {
  const { threads, projects } = experimental_useSidebarThreads();
  const navigate = useBbNavigate();
  const cycleShortcut = experimental_useCommandShortcut(
    CYCLE_PROJECT_COMMAND_ID,
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const recent = useMemo(
    () => recentProjects(projects, threads),
    [projects, threads],
  );
  const cycleRef = useRef<() => boolean>(() => false);
  cycleRef.current = () => {
    if (setProjectId === null) return false;
    setProjectId(nextCycledProject(projectId, recent));
    return true;
  };
  useEffect(() => {
    const overview: MountedOverview = {
      root: rootRef,
      cycle: () => cycleRef.current(),
    };
    mountedOverviews.add(overview);
    return () => {
      mountedOverviews.delete(overview);
    };
  }, []);
  return (
    <NewThreadOverview
      rootRef={rootRef}
      threads={threads}
      projects={projects}
      projectId={projectId}
      setProjectId={setProjectId}
      cycleShortcutLabel={cycleShortcut?.label ?? null}
      picker={
        <ProjectPicker
          value={projectId}
          onChange={(nextProjectId) => setProjectId?.(nextProjectId)}
          disabled={setProjectId === null}
        />
      }
      onOpenThread={(thread, { newTab }) =>
        navigate.toThread(
          thread.id,
          newTab ? { experimental_tab: true } : undefined,
        )
      }
    />
  );
}

export default definePluginApp((app) => {
  app.slots.homepageSection({
    id: "new-thread-overview",
    title: "New thread overview",
    component: NewThreadOverviewSection,
    experimental_placement: "lead",
  });
  app.composer.experimental_registerCommand({
    id: CYCLE_PROJECT_COMMAND_ID,
    title: "Cycle new thread project",
    defaultShortcut: { key: "o", alt: true },
    run({ composer }) {
      cycleProjectFromComposer(composer);
    },
  });
});
