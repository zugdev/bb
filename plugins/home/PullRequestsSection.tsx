import { experimental_Icon as Icon } from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import type {
  ProjectPullRequest,
  PullRequestChecks,
  PullRequestReview,
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

const REVIEW_ICONS: Record<
  PullRequestReview,
  { name: string; className: string; label: string }
> = {
  approved: { name: "Check", className: "text-success-foreground", label: "Approved" },
  "changes-requested": {
    name: "AlertCircle",
    className: "text-destructive-text",
    label: "Changes requested",
  },
  pending: { name: "Eye", className: "text-muted-foreground/60", label: "Awaiting review" },
};

export function PullRequestsSection({
  pullRequests,
  expanded,
  setExpanded,
  onSelect,
}: {
  pullRequests: readonly ProjectPullRequest[] | null;
  expanded: boolean;
  setExpanded: (expanded: boolean) => void;
  onSelect: (pr: ProjectPullRequest) => void;
}) {
  return (
    <section className="flex flex-col">
      <button
        type="button"
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
        className="-mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-left transition-colors hover:bg-state-hover"
      >
        <Icon name="GitPullRequest" className="size-4 text-muted-foreground" />
        <h2 className="text-sm font-semibold">Your pull requests</h2>
        {expanded && pullRequests !== null ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {pullRequests.length}
          </span>
        ) : null}
        <Icon
          name={expanded ? "ChevronDown" : "ChevronRight"}
          className="size-3.5 text-muted-foreground"
        />
      </button>
      {!expanded ? null : pullRequests === null ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : pullRequests.length === 0 ? (
        <p className="text-sm text-muted-foreground">No open pull requests</p>
      ) : null}
      {(expanded ? (pullRequests ?? []) : []).map((pr) => {
        const dot = CHECK_DOTS[pr.checks];
        const review = REVIEW_ICONS[pr.review];
        return (
          <div
            key={pr.number}
            className="group/pr -mx-2 flex h-8 min-w-0 items-center rounded-md transition-colors hover:bg-state-hover"
          >
            <button
              type="button"
              title={
                pr.worktreePath === null
                  ? `Start a worktree from ${pr.headRefName}`
                  : `Work in ${pr.worktreePath}`
              }
              className="flex h-full min-w-0 flex-1 items-center gap-2.5 rounded-md px-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
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
                aria-label={review.label}
                title={review.label}
                className="flex shrink-0"
              >
                <Icon
                  name={review.name}
                  aria-hidden
                  className={cn("size-3.5", review.className)}
                />
              </span>
              <span
                role="img"
                aria-label={dot.label}
                title={dot.label}
                className={cn("size-2 shrink-0 rounded-full", dot.className)}
              />
            </button>
            <a
              href={pr.url}
              target="_blank"
              rel="noreferrer"
              aria-label={`Open #${pr.number} on GitHub`}
              title="Open on GitHub"
              className="mr-1 flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <Icon name="Github" className="size-3.5" />
            </a>
          </div>
        );
      })}
    </section>
  );
}
