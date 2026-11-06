import { useMemo, useState, type CSSProperties, type ReactNode } from "react";
import {
  closestCenter,
  DndContext,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  experimental_Icon as Icon,
  type PluginSidebarProject,
  type PluginSidebarThread,
} from "@get-bb/plugin-sdk/app";
import { cn } from "@bb/shared-ui/lib/utils";
import {
  HOME_THREAD_SORTS,
  homeAttention,
  homeThreadTime,
  liveThreadDescendants,
  moveHomeSection,
  pluginSectionId,
  projectSectionId,
  repoWebUrl,
  resolveHomeSections,
  setHomeSectionHidden,
  sortAndFilterHomeThreads,
  type HomeLayoutPrefs,
  type HomeThreadSort,
} from "./home-overview";
import {
  ThreadDescendantsContext,
  ThreadRow,
  type OpenThread,
} from "./ThreadRow";

const PROJECT_ROW_LIMIT = 6;
const ATTENTION_ROW_LIMIT = 5;

const ICON_BUTTON_CLASS =
  "flex size-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring";

export interface HomePluginSection {
  pluginId: string;
  id: string;
  title: string;
}

export interface HomeThreadOrder {
  sort: HomeThreadSort;
  setSort: (sort: HomeThreadSort) => void;
  isOldestFirst: boolean;
  setIsOldestFirst: (isOldestFirst: boolean) => void;
}

export interface HomePageProps {
  threads: readonly PluginSidebarThread[];
  projects: readonly PluginSidebarProject[];
  pluginSections: readonly HomePluginSection[];
  renderPluginSection: (section: HomePluginSection) => ReactNode;
  layout: HomeLayoutPrefs;
  setLayout: (layout: HomeLayoutPrefs) => void;
  order: HomeThreadOrder;
  search: {
    shortcutLabel: string | null;
    open: (anchor: HTMLElement) => void;
  };
  addProject: { isAvailable: boolean; isCreating: boolean; open: () => void };
  onOpenThread: OpenThread;
  onNewThread: (projectId: string) => void;
}

function AttentionColumn({
  title,
  threads,
  emptyText,
  projectNames,
  onOpen,
}: {
  title: string;
  threads: readonly PluginSidebarThread[];
  emptyText: string;
  projectNames: ReadonlyMap<string, string>;
  onOpen: OpenThread;
}) {
  return (
    <div className="flex min-w-0 flex-col">
      <h2 className="flex items-baseline gap-2 pb-1.5 text-sm font-medium">
        {title}
        {threads.length > 0 ? (
          <span className="text-xs font-normal text-muted-foreground tabular-nums">
            {threads.length}
          </span>
        ) : null}
      </h2>
      {threads.length === 0 ? (
        <p className="py-1.5 text-xs text-muted-foreground">{emptyText}</p>
      ) : (
        threads
          .slice(0, ATTENTION_ROW_LIMIT)
          .map((thread) => (
            <ThreadRow
              key={thread.id}
              thread={thread}
              projectName={projectNames.get(thread.projectId) ?? null}
              time={thread.latestAttentionAt}
              onOpen={onOpen}
            />
          ))
      )}
    </div>
  );
}

function AttentionPanel({
  needsYou,
  replies,
  projectNames,
  onOpen,
}: {
  needsYou: readonly PluginSidebarThread[];
  replies: readonly PluginSidebarThread[];
  projectNames: ReadonlyMap<string, string>;
  onOpen: OpenThread;
}) {
  if (needsYou.length === 0 && replies.length === 0) return null;
  return (
    <div className="grid gap-x-8 gap-y-5 rounded-xl bg-surface-recessed px-4 py-3.5 md:grid-cols-2">
      <AttentionColumn
        title="Needs you"
        threads={needsYou}
        emptyText="Nothing is waiting on you"
        projectNames={projectNames}
        onOpen={onOpen}
      />
      <AttentionColumn
        title="Latest replies"
        threads={replies}
        emptyText="No unread replies"
        projectNames={projectNames}
        onOpen={onOpen}
      />
    </div>
  );
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

function SortableSection({
  id,
  isEditing,
  label,
  icon,
  onHide,
  children,
}: {
  id: string;
  isEditing: boolean;
  label: string;
  icon: string;
  onHide: () => void;
  children: ReactNode;
}) {
  const {
    attributes,
    listeners,
    setActivatorNodeRef,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id, disabled: !isEditing });
  const style: CSSProperties = {
    transform: CSS.Translate.toString(transform),
    transition,
  };
  if (!isEditing)
    return (
      <div ref={setNodeRef} className="empty:hidden">
        {children}
      </div>
    );
  return (
    <div
      ref={setNodeRef}
      style={style}
      className={cn(
        "flex h-10 items-center gap-2 rounded-lg bg-surface-recessed px-2 text-sm",
        isDragging && "relative z-10 bg-background shadow-lg",
      )}
    >
      <button
        ref={setActivatorNodeRef}
        type="button"
        aria-label={`Move ${label}`}
        className={cn(
          ICON_BUTTON_CLASS,
          "cursor-grab touch-none active:cursor-grabbing",
        )}
        {...attributes}
        {...listeners}
      >
        <Icon name="DragDropVertical" className="size-3.5" />
      </button>
      <Icon name={icon} className="size-4 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate font-medium">{label}</span>
      <button
        type="button"
        aria-label={`Hide ${label}`}
        className={ICON_BUTTON_CLASS}
        onClick={onHide}
      >
        <Icon name="EyeOff" className="size-3.5" />
      </button>
    </div>
  );
}

export function HomePage({
  threads,
  projects: unorderedProjects,
  pluginSections: pluginSectionList,
  renderPluginSection,
  layout: prefs,
  setLayout: setPrefs,
  order,
  search,
  addProject,
  onOpenThread,
  onNewThread,
}: HomePageProps) {
  const [isEditing, setIsEditing] = useState(false);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 4 } }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    }),
  );
  const projects = useMemo(
    () => [
      ...unorderedProjects.filter((project) => project.isPersonal),
      ...unorderedProjects.filter((project) => !project.isPersonal),
    ],
    [unorderedProjects],
  );
  const projectNames = useMemo(
    () => new Map(projects.map((project) => [project.id, project.name])),
    [projects],
  );
  const threadsByProject = useMemo(() => {
    const byProject = new Map<string, PluginSidebarThread[]>();
    for (const thread of threads) {
      const list = byProject.get(thread.projectId);
      if (list === undefined) byProject.set(thread.projectId, [thread]);
      else list.push(thread);
    }
    return byProject;
  }, [threads]);
  const attention = useMemo(() => homeAttention(threads), [threads]);
  const descendants = useMemo(() => liveThreadDescendants(threads), [threads]);
  const pluginSections = new Map(
    pluginSectionList.map((section) => [
      pluginSectionId(section.pluginId, section.id),
      section,
    ]),
  );
  const sections = resolveHomeSections(
    prefs,
    projects.map((project) => project.id),
    [...pluginSections.keys()],
  );

  const describe = (id: string) => {
    if (id === "attention")
      return {
        icon: "BellDot",
        label: "Needs you and latest replies",
        body: (
          <AttentionPanel
            needsYou={attention.needsYou}
            replies={attention.replies}
            projectNames={projectNames}
            onOpen={onOpenThread}
          />
        ),
      };
    const pluginSection = pluginSections.get(id);
    if (pluginSection !== undefined)
      return {
        icon: "Puzzle",
        label: pluginSection.title,
        body: renderPluginSection(pluginSection),
      };
    const project = projects.find((p) => projectSectionId(p.id) === id);
    if (project === undefined) return null;
    return {
      icon: project.isPersonal ? "UserRound" : "FolderGit",
      label: project.name,
      body: (
        <ProjectSection
          project={project}
          threads={threadsByProject.get(project.id) ?? []}
          order={order}
          onOpen={onOpenThread}
          onNewThread={() => onNewThread(project.id)}
        />
      ),
    };
  };

  const handleDragEnd = (event: DragEndEvent) => {
    if (typeof event.active.id !== "string") return;
    if (typeof event.over?.id !== "string") return;
    setPrefs(
      moveHomeSection(prefs, sections.visible, event.active.id, event.over.id),
    );
  };

  return (
    <ThreadDescendantsContext value={descendants}>
      <div className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto flex max-w-3xl flex-col gap-8 pt-4 pb-10">
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="flex h-8 items-center gap-2 rounded-lg bg-surface-recessed px-3 text-sm text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              onClick={(event) => search.open(event.currentTarget)}
            >
              <Icon name="Search" className="size-3.5" />
              Search threads
              {search.shortcutLabel === null ? null : (
                <kbd className="pl-3 font-sans text-xs">
                  {search.shortcutLabel}
                </kbd>
              )}
            </button>
            <div className="ml-auto flex items-center gap-1">
              {addProject.isAvailable ? (
                <button
                  type="button"
                  disabled={addProject.isCreating}
                  className="flex h-8 items-center gap-2 rounded-lg px-2.5 text-xs text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                  onClick={addProject.open}
                >
                  <Icon name="FolderPlus" className="size-3.5" />
                  Add project
                </button>
              ) : null}
              <button
                type="button"
                aria-label={isEditing ? "Finish editing Home" : "Edit Home"}
                aria-pressed={isEditing}
                className={cn(
                  ICON_BUTTON_CLASS,
                  "size-8 rounded-lg",
                  isEditing &&
                    "bg-foreground text-background hover:bg-foreground/90 hover:text-background",
                )}
                onClick={() => setIsEditing(!isEditing)}
              >
                <Icon
                  name={isEditing ? "Check" : "SlidersHorizontal"}
                  className="size-3.5"
                />
              </button>
            </div>
          </div>
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={sections.visible}
              strategy={verticalListSortingStrategy}
            >
              <div
                className={cn("flex flex-col", isEditing ? "gap-1.5" : "gap-8")}
              >
                {sections.visible.map((id) => {
                  const section = describe(id);
                  if (section === null) return null;
                  return (
                    <SortableSection
                      key={id}
                      id={id}
                      isEditing={isEditing}
                      label={section.label}
                      icon={section.icon}
                      onHide={() =>
                        setPrefs(
                          setHomeSectionHidden(
                            prefs,
                            sections.visible,
                            id,
                            true,
                          ),
                        )
                      }
                    >
                      {section.body}
                    </SortableSection>
                  );
                })}
              </div>
            </SortableContext>
          </DndContext>
          {isEditing && sections.hidden.length > 0 ? (
            <div className="-mt-4 flex flex-col gap-1">
              <p className="text-xs text-muted-foreground">Hidden</p>
              {sections.hidden.map((id) => {
                const section = describe(id);
                if (section === null) return null;
                return (
                  <button
                    key={id}
                    type="button"
                    className="-mx-2 flex h-8 items-center gap-2 rounded-md px-2 text-left text-sm text-muted-foreground transition-colors hover:bg-state-hover hover:text-foreground"
                    onClick={() =>
                      setPrefs(
                        setHomeSectionHidden(
                          prefs,
                          sections.visible,
                          id,
                          false,
                        ),
                      )
                    }
                  >
                    <Icon name="Plus" className="size-3.5" />
                    {section.label}
                  </button>
                );
              })}
            </div>
          ) : null}
        </div>
      </div>
    </ThreadDescendantsContext>
  );
}
