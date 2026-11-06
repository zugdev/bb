import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_HomepageSection as HomepageSection,
  experimental_ProjectPicker as ProjectPicker,
  experimental_useAddProject,
  experimental_useCommandShortcut,
  experimental_useHomepageSections,
  experimental_useSidebarThreads,
  experimental_useThreadSearch,
  useBbNavigate,
  type PluginComposerApi,
  type PluginHomepageSectionProps,
} from "@get-bb/plugin-sdk/app";
import {
  DEFAULT_HOME_LAYOUT,
  isHomeLayoutPrefs,
  isHomeThreadSort,
  nextCycledProject,
  recentProjects,
  type HomeLayoutPrefs,
  type HomeThreadSort,
} from "./home-overview";
import { HomePage } from "./HomePage";
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
  const order = useHomeThreadOrder();
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
      order={order}
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
          newTab ? { experimental_tab: true } : { experimental_inPane: true },
        )
      }
    />
  );
}

export const HOME_LAYOUT_KEY = "bb.home.layout";
const HOME_THREAD_SORT_KEY = "bb.home.threadSort";
const HOME_THREAD_OLDEST_FIRST_KEY = "bb.home.threadOldestFirst";

function readStored<T>(
  key: string,
  isValue: (value: unknown) => value is T,
  fallback: T,
): T {
  try {
    const stored = window.localStorage.getItem(key);
    if (stored === null) return fallback;
    const parsed: unknown = JSON.parse(stored);
    return isValue(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function useStoredState<T>(
  key: string,
  isValue: (value: unknown) => value is T,
  fallback: T,
): [T, (value: T) => void] {
  const [value, setValue] = useState(() => readStored(key, isValue, fallback));
  const store = useCallback(
    (next: T) => {
      setValue(next);
      window.localStorage.setItem(key, JSON.stringify(next));
    },
    [key],
  );
  return [value, store];
}

const isBoolean = (value: unknown): value is boolean =>
  typeof value === "boolean";

function useHomeThreadOrder() {
  const [sort, setSort] = useStoredState<HomeThreadSort>(
    HOME_THREAD_SORT_KEY,
    isHomeThreadSort,
    "message",
  );
  const [isOldestFirst, setIsOldestFirst] = useStoredState(
    HOME_THREAD_OLDEST_FIRST_KEY,
    isBoolean,
    false,
  );
  return { sort, setSort, isOldestFirst, setIsOldestFirst };
}

function HomePanel() {
  const { threads, projects } = experimental_useSidebarThreads();
  const navigate = useBbNavigate();
  const sections = experimental_useHomepageSections();
  const threadSearch = experimental_useThreadSearch();
  const addProject = experimental_useAddProject();
  const [layout, setLayout] = useStoredState<HomeLayoutPrefs>(
    HOME_LAYOUT_KEY,
    isHomeLayoutPrefs,
    DEFAULT_HOME_LAYOUT,
  );
  const order = useHomeThreadOrder();
  const pluginSections = useMemo(
    () => sections.filter((section) => section.experimental_placement === null),
    [sections],
  );
  return (
    <HomePage
      threads={threads}
      projects={projects}
      pluginSections={pluginSections}
      renderPluginSection={(section) => (
        <HomepageSection pluginId={section.pluginId} sectionId={section.id} />
      )}
      layout={layout}
      setLayout={setLayout}
      order={order}
      search={{
        shortcutLabel: threadSearch.shortcut?.label ?? null,
        open: threadSearch.open,
      }}
      addProject={addProject}
      onOpenThread={(thread) =>
        navigate.toThread(thread.id, { experimental_tab: true })
      }
      onNewThread={(projectId) =>
        navigate.toCompose({ projectId, experimental_tab: true })
      }
    />
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "home",
    title: "Home",
    icon: "Home",
    path: "home",
    component: HomePanel,
    experimental_pinnedTab: true,
  });
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
