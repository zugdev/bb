import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import type {
  ProjectPullRequest,
  PullRequestChecks,
} from "bb-plugin-environment-git-worktree/pull-requests-contract";

const CHECK_DOTS: Record<PullRequestChecks, { className: string; label: string }> = {
  passing: { className: "bg-success", label: "Checks passed" },
  running: {
    className: "animate-pulse bg-warning motion-reduce:animate-none",
    label: "Checks running",
  },
  failing: { className: "bg-destructive", label: "Checks failed" },
  none: { className: "bg-muted-foreground/40", label: "No checks" },
};

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
      {pullRequests.map((pr) => {
        const dot = CHECK_DOTS[pr.checks];
        return (
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
            <Icon
              name={pr.isDraft ? "GitPullRequestDraft" : "GitPullRequest"}
              aria-label={pr.isDraft ? "Draft" : "Ready for review"}
              className={cn(
                "size-4 shrink-0",
                pr.isDraft ? "text-muted-foreground" : "text-success-foreground",
              )}
            />
            <span className="min-w-0 flex-1 truncate">{pr.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums">
              #{pr.number}
            </span>
            <span
              role="img"
              aria-label={dot.label}
              title={dot.label}
              className={cn("size-2 shrink-0 rounded-full", dot.className)}
            />
          </button>
        );
      })}
    </section>
  );
}
