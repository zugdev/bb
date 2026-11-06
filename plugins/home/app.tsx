import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  definePluginApp,
  experimental_ProjectPicker as ProjectPicker,
  experimental_useCommandShortcut,
  experimental_useRpcQuery,
  experimental_useSidebarThreads,
  useComposer,
  useBbNavigate,
  useSdk,
  type PluginComposerApi,
  type PluginHomepageSectionProps,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import {
  GIT_WORKTREE_PLUGIN_ID,
  pullRequestEnvironment,
  worktreePullRequestsRpcContract,
} from "bb-plugin-environment-git-worktree/pull-requests-contract";
import {
  DEFAULT_HOME_THREAD_FILTER,
  isHomeThreadFilter,
  isHomeThreadSort,
  nextCycledProject,
  recentProjects,
  type HomeThreadFilter,
  type HomeThreadSort,
} from "./home-overview";
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
  const sdk = useSdk();
  const [filter, setFilter] = useStoredState<HomeThreadFilter>(
    HOME_THREAD_FILTER_KEY,
    isHomeThreadFilter,
    DEFAULT_HOME_THREAD_FILTER,
  );
  const archiveThreads = async (archived: readonly PluginSidebarThread[]) => {
    const results = await Promise.allSettled(
      archived.map((thread) => sdk.threads.archive({ threadId: thread.id })),
    );
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      toast.error(
        `Failed to archive ${failed.length} of ${results.length} threads.`,
      );
    } else {
      toast.success(`Archived ${results.length} threads.`);
    }
  };
  const composer = useComposer();
  const pullRequestsQuery = experimental_useRpcQuery({
    contract: worktreePullRequestsRpcContract,
    pluginId: GIT_WORKTREE_PLUGIN_ID,
    method: "listOpenPullRequests",
    input: { projectId: projectId ?? "", hostId: null },
    enabled: projectId !== null && setProjectId !== null,
  });
  const pullRequestHostId = pullRequestsQuery.data?.hostId ?? null;
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
      filter={filter}
      setFilter={setFilter}
      onArchiveThreads={archiveThreads}
      pullRequests={
        projectId === null || pullRequestHostId === null
          ? []
          : (pullRequestsQuery.data?.pullRequests ?? [])
      }
      onSelectPullRequest={(pr) => {
        if (pullRequestHostId === null) return;
        void composer
          .setSelection({
            environment: pullRequestEnvironment(pullRequestHostId, pr),
          })
          .then(() => composer.focus())
          .catch((error: unknown) =>
            toast.error(
              error instanceof Error
                ? error.message
                : "Could not select the pull request's worktree.",
            ),
          );
      }}
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

export const HOME_THREAD_FILTER_KEY = "bb.home.threadFilter";
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
