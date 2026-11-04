import { useState } from "react";
import type { ThreadListEntry } from "@bb/domain";
import { StoryCard, StoryRow } from "../../.ladle/story-card";
import {
  PROJECT_IDS,
  PROJECT_NAMES,
  makeThreadListEntry,
} from "../../.ladle/story-fixtures";
import { RootComposeOverview } from "./RootComposeOverview";

export default {
  title: "views/New thread overview",
};

const MINUTE = 60_000;
const now = Date.now();

function thread(
  id: string,
  projectId: string,
  title: string,
  minutesAgo: number,
  waiting = false,
): ThreadListEntry {
  return makeThreadListEntry({
    id,
    projectId,
    title,
    titleFallback: title,
    hasPendingInteraction: waiting,
    lastUserMessageAt: now - minutesAgo * MINUTE,
    latestAttentionAt: now - minutesAgo * MINUTE,
  });
}

const SIDEBAR = {
  personalProject: {
    id: "proj_personal",
    threads: [thread("me-1", "proj_personal", "Pick a release date", 90, true)],
  },
  projects: [
    {
      id: PROJECT_IDS.bb,
      name: PROJECT_NAMES.bb,
      threads: [
        thread("bb-1", PROJECT_IDS.bb, "Approve the migration plan", 4, true),
        thread("bb-2", PROJECT_IDS.bb, "Rework folder model", 12),
        thread("bb-3", PROJECT_IDS.bb, "Reduce style recalculation", 45),
        thread("bb-4", PROJECT_IDS.bb, "Wire up automations CLI", 180),
        thread("bb-5", PROJECT_IDS.bb, "Fix tab drag on Safari", 600),
        thread("bb-6", PROJECT_IDS.bb, "Old spike", 3000),
      ],
    },
    {
      id: PROJECT_IDS.pierre,
      name: PROJECT_NAMES.pierre,
      threads: [
        thread("p-1", PROJECT_IDS.pierre, "Debug host daemon reconnect", 30),
        thread("p-2", PROJECT_IDS.pierre, "Bump the protocol version", 240),
      ],
    },
  ],
};

const OPTIONS = SIDEBAR.projects.map(({ id, name }) => ({ id, name }));

function Stage({ initialProject }: { initialProject: string | null }) {
  const [value, setValue] = useState(initialProject);
  return (
    <div className="flex w-[720px] flex-col gap-4 bg-background p-4">
      <RootComposeOverview
        sidebarNavigation={SIDEBAR}
        projectNamesById={new Map(OPTIONS.map(({ id, name }) => [id, name]))}
        project={{
          options: OPTIONS,
          value,
          onChange: setValue,
          createProject: { onCreate: () => undefined },
          disabled: false,
        }}
        onOpenThread={() => undefined}
        isFocusedPane
      />
      <div className="h-28 rounded-xl border bg-card p-3 text-sm text-muted-foreground">
        Composer
      </div>
    </div>
  );
}

export function Overview() {
  return (
    <StoryCard labelWidth="170px">
      <StoryRow label="no project">
        <Stage initialProject={null} />
      </StoryRow>
      <StoryRow label="project with a waiting thread">
        <Stage initialProject={PROJECT_IDS.bb} />
      </StoryRow>
      <StoryRow label="project with nothing waiting">
        <Stage initialProject={PROJECT_IDS.pierre} />
      </StoryRow>
    </StoryCard>
  );
}
