import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import type { ProjectPullRequest } from "bb-plugin-environment-git-worktree/pull-requests-contract";

export function PullRequestsSection({
  pullRequests,
  onSelect,
}: {
  pullRequests: readonly ProjectPullRequest[];
  onSelect: (pr: ProjectPullRequest) => void;
}) {
  return (
    <section className="flex flex-col">
      <div className="flex h-8 items-center gap-2">
        <Icon name="GitPullRequest" className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Your pull requests</h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {pullRequests.length}
        </span>
      </div>
      {pullRequests.map((pr) => (
        <button
          key={pr.number}
          type="button"
          title={
            pr.worktreePath === null
              ? `Start a worktree from ${pr.headRefName}`
              : `Work in ${pr.worktreePath}`
          }
          className="-mx-2 flex h-8 min-w-0 items-center gap-2.5 rounded-md px-2 text-left text-sm transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={() => onSelect(pr)}
        >
          <span className="w-12 shrink-0 text-xs text-muted-foreground tabular-nums">
            #{pr.number}
          </span>
          <span className="min-w-0 flex-1 truncate">{pr.title}</span>
          <span className="max-w-48 shrink-0 truncate text-xs text-muted-foreground">
            {pr.isDraft ? "draft · " : ""}
            {pr.headRefName}
          </span>
        </button>
      ))}
    </section>
  );
}
