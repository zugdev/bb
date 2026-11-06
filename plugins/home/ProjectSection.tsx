import { useMemo, useState } from "react";
import {
  experimental_Icon as Icon,
  type PluginSidebarProject,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  HOME_THREAD_SORTS,
  homeThreadTime,
  repoWebUrl,
  sortAndFilterHomeThreads,
  type HomeThreadSort,
} from "./home-overview";
import { ThreadRow, type OpenThread } from "./ThreadRow";

const PROJECT_ROW_LIMIT = 6;

const ICON_BUTTON_CLASS =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface HomeThreadOrder {
  sort: HomeThreadSort;
  setSort: (sort: HomeThreadSort) => void;
  isOldestFirst: boolean;
  setIsOldestFirst: (isOldestFirst: boolean) => void;
}

export function ProjectSection({
  project,
  threads: projectThreads,
  order,
  onOpen,
  onNewThread,
}: {
  project: PluginSidebarProject;
  threads: readonly PluginSidebarThread[];
  order: HomeThreadOrder;
  onOpen: OpenThread;
  onNewThread: () => void;
}) {
  const [filter, setFilter] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const { sort, setSort, isOldestFirst, setIsOldestFirst } = order;
  const query = filter ?? "";
  const threads = useMemo(
    () => sortAndFilterHomeThreads(projectThreads, sort, query, isOldestFirst),
    [projectThreads, sort, query, isOldestFirst],
  );
  const pageCount = Math.max(1, Math.ceil(threads.length / PROJECT_ROW_LIMIT));
  const currentPage = Math.min(page, pageCount - 1);
  const pageStart = currentPage * PROJECT_ROW_LIMIT;
  const shown = threads.slice(pageStart, pageStart + PROJECT_ROW_LIMIT);
  const sortIndex = HOME_THREAD_SORTS.findIndex((s) => s.value === sort);
  const sortOption = HOME_THREAD_SORTS[sortIndex] ?? HOME_THREAD_SORTS[0];
  const repoUrl = repoWebUrl(project.experimental_gitRemoteUrl);
  return (
    <section className="group/project flex flex-col">
      <div className="flex h-8 items-center gap-2">
        <Icon
          name={project.isPersonal ? "UserRound" : "FolderGit"}
          className="size-4 text-muted-foreground"
        />
        <h2 className="min-w-0 truncate text-sm font-semibold">
          {project.name}
        </h2>
        <span className="text-xs text-muted-foreground tabular-nums">
          {threads.length}
        </span>
        <div className="ml-auto flex items-center gap-0.5 transition-opacity md:opacity-0 md:group-focus-within/project:opacity-100 md:group-hover/project:opacity-100">
          <button
            type="button"
            className="h-7 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground"
            onClick={() =>
              setSort(
                HOME_THREAD_SORTS[(sortIndex + 1) % HOME_THREAD_SORTS.length]
                  .value,
              )
            }
          >
            {sortOption.label}
          </button>
          <button
            type="button"
            aria-label={
              isOldestFirst ? "Show newest first" : "Show oldest first"
            }
            className={ICON_BUTTON_CLASS}
            onClick={() => setIsOldestFirst(!isOldestFirst)}
          >
            <Icon
              name={isOldestFirst ? "ArrowUp" : "ArrowDown"}
              className="size-3.5"
            />
          </button>
          <button
            type="button"
            aria-label={`Filter ${project.name} threads`}
            className={ICON_BUTTON_CLASS}
            onClick={() => setFilter(filter === null ? "" : null)}
          >
            <Icon name="Search" className="size-3.5" />
          </button>
          {repoUrl === null ? null : (
            <a
              href={repoUrl}
              target="_blank"
              rel="noreferrer"
              aria-label="Open repository"
              className={ICON_BUTTON_CLASS}
            >
              <Icon name="Github" className="size-3.5" />
            </a>
          )}
          <a
            href={project.settingsHref}
            aria-label="Project settings"
            className={ICON_BUTTON_CLASS}
          >
            <Icon name="Settings" className="size-3.5" />
          </a>
        </div>
      </div>
      {filter === null ? null : (
        <input
          autoFocus
          className="my-1 h-8 rounded-md bg-surface-recessed px-2.5 text-sm outline-none placeholder:text-muted-foreground focus-visible:ring-2 focus-visible:ring-ring"
          value={filter}
          placeholder="Filter by title"
          onChange={(event) => {
            setFilter(event.target.value);
            setPage(0);
          }}
          onKeyDown={(event) => {
            if (event.key === "Escape") setFilter(null);
          }}
        />
      )}
      {shown.map((thread) => (
        <ThreadRow
          key={thread.id}
          thread={thread}
          projectName={null}
          time={homeThreadTime(thread, sort)}
          onOpen={onOpen}
        />
      ))}
      {threads.length === 0 && query.length > 0 ? (
        <p className="py-1.5 text-xs text-muted-foreground">No titles match</p>
      ) : null}
      <div className="flex h-8 items-center gap-2">
        <button
          type="button"
          className="-mx-2 flex h-7 items-center gap-2.5 rounded-md px-2 text-xs text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          onClick={onNewThread}
        >
          <span className="flex size-4 items-center justify-center">
            <Icon name="Plus" className="size-3.5" />
          </span>
          New thread
        </button>
        {pageCount > 1 ? (
          <div className="ml-auto flex items-center gap-0.5 text-xs text-muted-foreground tabular-nums">
            <span className="pr-1">
              {pageStart + 1}–{pageStart + shown.length} of {threads.length}
            </span>
            <button
              type="button"
              aria-label="Previous page"
              disabled={currentPage === 0}
              className={cn(ICON_BUTTON_CLASS, "size-6 disabled:opacity-40")}
              onClick={() => setPage(currentPage - 1)}
            >
              <Icon name="ChevronLeft" className="size-3.5" />
            </button>
            <button
              type="button"
              aria-label="Next page"
              disabled={currentPage === pageCount - 1}
              className={cn(ICON_BUTTON_CLASS, "size-6 disabled:opacity-40")}
              onClick={() => setPage(currentPage + 1)}
            >
              <Icon name="ChevronRight" className="size-3.5" />
            </button>
          </div>
        ) : null}
      </div>
    </section>
  );
}
