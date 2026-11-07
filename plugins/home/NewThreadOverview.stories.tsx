import { useState } from "react";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { makeProject, makeThread, PERSONAL } from "./fixtures";
import { NewThreadOverview } from "./NewThreadOverview";
import {
  DEFAULT_HOME_THREAD_FILTER,
  type HomeThreadSort,
} from "./home-overview";

export default { title: "plugins/Home/New thread overview" };

const MINUTE = 60_000;
const now = Date.now();
const BB = makeProject("proj_bb", "bb");
const PIERRE = makeProject("proj_pierre", "pierre");
const PROJECTS = [PERSONAL, BB, PIERRE];

function thread(
  id: string,
  projectId: string,
  title: string,
  minutesAgo: number,
  waiting = false,
): PluginSidebarThread {
  return makeThread({
    id,
    projectId,
    title,
    displayTitle: title,
    hasPendingInteraction: waiting,
    experimental_lastUserMessageAt: now - minutesAgo * MINUTE,
    latestAttentionAt: now - minutesAgo * MINUTE,
  });
}

const THREADS = [
  thread("me-1", PERSONAL.id, "Pick a release date", 90, true),
  thread("bb-1", BB.id, "Approve the migration plan", 4, true),
  thread("bb-2", BB.id, "Rework folder model", 12),
  thread("bb-3", BB.id, "Reduce style recalculation", 45),
  thread("bb-4", BB.id, "Wire up automations CLI", 180),
  thread("bb-5", BB.id, "Fix tab drag on Safari", 600),
  thread("bb-6", BB.id, "Old spike", 3000),
  thread("p-1", PIERRE.id, "Debug host daemon reconnect", 30),
  thread("p-2", PIERRE.id, "Bump the protocol version", 240),
];

function Stage({ initialProject }: { initialProject: string | null }) {
  const [projectId, setProjectId] = useState(initialProject);
  const [filter, setFilter] = useState(DEFAULT_HOME_THREAD_FILTER);
  const [sort, setSort] = useState<HomeThreadSort>("message");
  const [isOldestFirst, setIsOldestFirst] = useState(false);
  const name =
    PROJECTS.find((project) => project.id === projectId)?.name ?? "No project";
  return (
    <div className="flex w-[720px] flex-col gap-4 bg-background p-4">
      <NewThreadOverview
        threads={THREADS}
        projects={PROJECTS}
        projectId={projectId}
        setProjectId={setProjectId}
        picker={
          <span className="h-7 rounded-md border px-2.5 text-xs leading-7">
            {name}
          </span>
        }
        cycleShortcutLabel="⌥ O"
        order={{ sort, setSort, isOldestFirst, setIsOldestFirst }}
        filter={filter}
        setFilter={setFilter}
        pullRequests={[
          {
            number: 128,
            title: "Show open pull requests on New thread",
            headRefName: "home-open-prs",
            isDraft: false,
            checks: "passing",
            worktreePath: null,
          },
          {
            number: 131,
            title: "Draft: split pane tabs",
            headRefName: "split-pane-tabs",
            isDraft: true,
            checks: "running",
            worktreePath: "/code/bb-split",
          },
        ]}
        onSelectPullRequest={() => undefined}
        onArchiveThreads={() => Promise.resolve()}
        onOpenThread={() => undefined}
      />
      <div className="h-28 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
        Composer
      </div>
    </div>
  );
}

export function NoProject() {
  return <Stage initialProject={null} />;
}

export function ProjectWithAWaitingThread() {
  return <Stage initialProject={BB.id} />;
}

export function ProjectWithNothingWaiting() {
  return <Stage initialProject={PIERRE.id} />;
}
