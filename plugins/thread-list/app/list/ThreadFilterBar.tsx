import { useState, type ReactNode } from "react";
import { useAtom } from "jotai";
import { useSdk } from "@get-bb/plugin-sdk/app";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Icon, type IconName } from "@/components/ui/icon";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { sidebarThreadFilterAtom } from "../preferences/atoms.js";
import { isRunningThread, isThreadFilterActive } from "../model/thread-filter.js";
import type { SidebarProject } from "../model/use-sidebar-data.js";
import type { SidebarThread } from "../model/sidebar-thread.js";
import type {
  ThreadFilter,
  ThreadFilterStatus,
} from "../../shared/preferences.js";
import { SidebarViewItems } from "./SidebarViewItems.js";

const STATUS_OPTIONS: { value: ThreadFilterStatus; label: string }[] = [
  { value: "all", label: "All threads" },
  { value: "running", label: "Running" },
  { value: "needs-you", label: "Needs you" },
];

const AGE_OPTIONS: { value: number | null; label: string }[] = [
  { value: null, label: "Any age" },
  { value: 1, label: "Older than 1 day" },
  { value: 7, label: "Older than 7 days" },
  { value: 30, label: "Older than 30 days" },
];

function FilterChip({
  label,
  icon,
  active,
  children,
}: {
  label: string;
  icon: IconName;
  active: boolean;
  children: ReactNode;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          aria-label={label}
          title={label}
          data-active={active ? "" : undefined}
          className="h-6 min-w-0 gap-1 rounded-md px-1.5 text-xs text-muted-foreground data-[active]:bg-accent data-[active]:text-foreground"
        >
          <Icon name={icon} className="size-3.5 shrink-0" />
          {active ? <span className="truncate">{label}</span> : null}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" sideOffset={4} mobileTitle={label}>
        {children}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function RadioItem({
  checked,
  onSelect,
  children,
}: {
  checked: boolean;
  onSelect: () => void;
  children: ReactNode;
}) {
  return (
    <DropdownMenuItem
      role="menuitemradio"
      aria-checked={checked}
      onSelect={onSelect}
    >
      {children}
      <span className="ml-auto inline-flex size-4 shrink-0 items-center justify-center">
        {checked && <Icon name="Check" className="size-4" />}
      </span>
    </DropdownMenuItem>
  );
}

export function archivableThreads(
  threads: readonly SidebarThread[],
): SidebarThread[] {
  const ids = new Set(threads.map((thread) => thread.id));
  return threads.filter(
    (thread) =>
      !thread.isArchived &&
      !thread.isPinned &&
      !isRunningThread(thread) &&
      (thread.parentThreadId === null || !ids.has(thread.parentThreadId)),
  );
}

export function ThreadFilterBar({
  allProjects,
  filteredThreads,
}: {
  allProjects: readonly SidebarProject[];
  filteredThreads: readonly SidebarThread[];
}) {
  const sdk = useSdk();
  const [filter, setFilter] = useAtom(sidebarThreadFilterAtom);
  const [archiving, setArchiving] = useState(false);
  const update = (patch: Partial<ThreadFilter>) =>
    setFilter((previous) => ({ ...previous, ...patch }));
  const projectName =
    filter.projectId === null
      ? null
      : (allProjects.find((project) => project.id === filter.projectId)
          ?.name ?? "Project");
  const statusLabel =
    STATUS_OPTIONS.find((option) => option.value === filter.status)?.label ??
    "All threads";
  const ageLabel =
    filter.olderThanDays === null ? "Any age" : `${filter.olderThanDays}d+`;
  const toArchive =
    filter.olderThanDays === null ? [] : archivableThreads(filteredThreads);

  const archiveMatches = async () => {
    setArchiving(true);
    const results = await Promise.allSettled(
      toArchive.map((thread) => sdk.threads.archive({ threadId: thread.id })),
    );
    setArchiving(false);
    const failed = results.filter((result) => result.status === "rejected");
    if (failed.length > 0) {
      toast.error(`Failed to archive ${failed.length} of ${results.length} threads.`);
    } else {
      toast.success(`Archived ${results.length} threads.`);
    }
  };

  return (
    <div
      className="flex shrink-0 items-center gap-0.5 pb-2"
      data-testid="thread-filter-bar"
    >
      <FilterChip
        label={statusLabel}
        icon="Activity"
        active={filter.status !== "all"}
      >
        <DropdownMenuGroup aria-label="Status">
          {STATUS_OPTIONS.map((option) => (
            <RadioItem
              key={option.value}
              checked={filter.status === option.value}
              onSelect={() => update({ status: option.value })}
            >
              {option.label}
            </RadioItem>
          ))}
        </DropdownMenuGroup>
      </FilterChip>
      <FilterChip
        label={projectName ?? "All projects"}
        icon="Folder"
        active={projectName !== null}
      >
        <DropdownMenuGroup aria-label="Project">
          <RadioItem
            checked={filter.projectId === null}
            onSelect={() => update({ projectId: null })}
          >
            All projects
          </RadioItem>
          {allProjects.map((project) => (
            <RadioItem
              key={project.id}
              checked={filter.projectId === project.id}
              onSelect={() => update({ projectId: project.id })}
            >
              {project.name}
            </RadioItem>
          ))}
        </DropdownMenuGroup>
      </FilterChip>
      <FilterChip
        label={ageLabel}
        icon="Clock"
        active={filter.olderThanDays !== null}
      >
        <DropdownMenuGroup aria-label="Age">
          {AGE_OPTIONS.map((option) => (
            <RadioItem
              key={option.label}
              checked={filter.olderThanDays === option.value}
              onSelect={() => update({ olderThanDays: option.value })}
            >
              {option.label}
            </RadioItem>
          ))}
        </DropdownMenuGroup>
        {toArchive.length > 0 ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              disabled={archiving}
              onSelect={() => void archiveMatches()}
            >
              <Icon name="Archive" className="size-4" />
              Archive {toArchive.length} idle{" "}
              {toArchive.length === 1 ? "thread" : "threads"}
            </DropdownMenuItem>
          </>
        ) : null}
      </FilterChip>
      <FilterChip label="Sort" icon="ArrowUpDown" active={false}>
        <SidebarViewItems page="sort" />
      </FilterChip>
      {isThreadFilterActive(filter) ? (
        <Button
          type="button"
          variant="ghost"
          size="icon"
          aria-label="Clear filters"
          className="ml-auto size-6 text-muted-foreground"
          onClick={() =>
            setFilter({ status: "all", projectId: null, olderThanDays: null })
          }
        >
          <Icon name="X" className="size-3.5" />
        </Button>
      ) : null}
    </div>
  );
}
