import {
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type ComponentProps,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { useAtomValue, useStore } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";
import { SPLIT_TAB_SELECT_APP_COMMAND_IDS } from "@bb/domain";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import { CONTEXT_SELECTION_SURFACE_CLASS } from "@bb/shared-ui/context-selection";
import { OverflowFade } from "@bb/shared-ui/overflow-fade";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@bb/shared-ui/context-menu";
import { TabPill } from "@/components/ui/tab-pill";
import { Tooltip, TooltipContent, TooltipTrigger } from "@bb/shared-ui/tooltip";
import { useThread } from "@/hooks/queries/thread-queries";
import {
  useProjectDisplayName,
  useSidebarNavigation,
} from "@/hooks/queries/sidebar-navigation-query";
import { useTabStripOverflow } from "@/components/ui/use-tab-strip-overflow";
import { ProjectSelector } from "@/components/pickers/ProjectSelector";
import {
  useAppCommandHandler,
  useAppCommandShortcuts,
  useIndexedAppCommandHandlers,
} from "@/components/commands/AppCommandProvider";
import { AppCommandShortcutHint } from "@/components/commands/AppCommandShortcutHint";
import { PINNED_TAB_ROUTE_PATH } from "@/lib/route-paths";
import { usePinnedTabPanel } from "@/lib/pinned-tab";
import type { AppShortcutPresentation } from "@/lib/app-keybindings";
import {
  useIsSidebarFramed,
  useIsSidebarShowing,
} from "@/components/ui/sidebar.js";
import { useUsesSwipeChrome } from "@/components/layout/useUsesSwipeChrome";
import {
  getBbDesktopInfo,
  MACOS_APP_REGION_NO_DRAG_CLASS,
  MACOS_TITLE_BAR_ROW_CLASS,
  MACOS_WINDOW_DRAG_CLASS,
  MACOS_WINDOW_NO_DRAG_CLASS,
  shouldUseMacosDesktopChrome,
} from "@/lib/bb-desktop";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import type { AuxiliaryDropTarget } from "@/lib/split-drag/splitDragSession";
import { countPanes, findPane, listPanes } from "@/lib/split-layout";
import {
  mostUrgentThreadDot,
  ThreadStatusDot,
  useThreadDescendants,
  useThreadEntriesById,
} from "@/components/thread/ThreadStatusDot";
import { threadDot } from "@/components/thread/thread-dot";
import type { PaneContent, SplitLayout } from "@/lib/split-layout";
import {
  closeSplitTabAtom,
  moveSplitTabAtom,
  renameSplitTabAtom,
  reopenClosedSplitItemAtom,
  selectSplitTabAtom,
  sharedThreadProjectId,
  splitTabsAtom,
  type SplitTab,
} from "@/lib/split-layout/tabs";
import { focusedPaneRoute, openComposeTab } from "./splitThreadNavigation";

function usePaneTitle(content: PaneContent | null): string {
  const threadId =
    content?.kind === "thread" || content?.kind === "thread-panel-tab"
      ? content.threadId
      : "";
  const thread = useThread(threadId);
  if (content === null || content.kind === "new-thread") return "New thread";
  if (content.kind === "thread" || content.kind === "thread-panel-tab") {
    return thread.data?.title ?? "Thread";
  }
  return "Extension";
}

function PaneTitle({ content }: { content: PaneContent }) {
  return <>{usePaneTitle(content)}</>;
}

function useSplitTabTitle(layout: SplitLayout | null, name: string | null) {
  const focused =
    layout === null ? null : findPane(layout.root, layout.focusedPaneId);
  const focusedTitle = usePaneTitle(focused?.content ?? null);
  const projectName = useProjectDisplayName(
    sharedThreadProjectId(layout) ?? undefined,
  );
  if (name !== null) return { title: name, isProjectName: false };
  if (projectName !== undefined) {
    return { title: projectName, isProjectName: true };
  }
  return { title: focusedTitle, isProjectName: false };
}

function useSplitTabDot(layout: SplitLayout | null) {
  const entries = useThreadEntriesById();
  const descendants = useThreadDescendants();
  return mostUrgentThreadDot(
    layout === null
      ? []
      : listPanes(layout.root).map((pane) => {
          const entry =
            pane.content.kind === "thread"
              ? entries.get(pane.content.threadId)
              : undefined;
          return entry === undefined ? null : threadDot(entry, descendants);
        }),
  );
}

function SplitTabTooltip({
  layout,
  title,
}: {
  layout: SplitLayout | null;
  title: string;
}) {
  const panes = layout === null ? [] : listPanes(layout.root);
  return (
    <div className="flex flex-col gap-1">
      <div className="font-medium">{title}</div>
      {panes.length > 0 ? (
        <ul className="flex flex-col gap-0.5 opacity-80">
          {panes.map((pane) => (
            <li key={pane.paneId} className="truncate">
              <PaneTitle content={pane.content} />
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const SPLIT_TAB_DROP_ATTR = "data-split-tab-drop";
const SPLIT_TAB_ID_ATTR = "data-split-tab-id";
const NEW_TAB_DROP_VALUE = "new";
const TAB_DRAG_ENGAGE_DISTANCE_PX = 6;

export function resolveSplitTabDropTarget(
  x: number,
  y: number,
  drop: (tabId: string | null) => void,
): AuxiliaryDropTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const target =
      element instanceof HTMLElement
        ? element.closest<HTMLElement>(`[${SPLIT_TAB_DROP_ATTR}]`)
        : null;
    const value = target?.getAttribute(SPLIT_TAB_DROP_ATTR);
    if (target == null || value == null) continue;
    const isNewTab = value === NEW_TAB_DROP_VALUE;
    return {
      element: target,
      label: isNewTab ? "Move to new tab" : "Move to tab",
      drop: () => drop(isNewTab ? null : value),
    };
  }
  return null;
}

const TAB_HOVER_SWITCH_DELAY_MS = 450;

function splitTabIdAt(x: number, y: number): string | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const value =
      element instanceof HTMLElement
        ? element
            .closest<HTMLElement>(`[${SPLIT_TAB_DROP_ATTR}]`)
            ?.getAttribute(SPLIT_TAB_DROP_ATTR)
        : null;
    if (value != null) return value === NEW_TAB_DROP_VALUE ? null : value;
  }
  return null;
}

export function createSplitTabHoverSwitch(switchTo: (tabId: string) => void) {
  let hoveredTabId: string | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const clear = () => {
    if (timer !== null) clearTimeout(timer);
    timer = null;
  };
  return {
    update(x: number, y: number) {
      const tabId = splitTabIdAt(x, y);
      if (tabId === hoveredTabId) return;
      clear();
      hoveredTabId = tabId;
      if (tabId === null) return;
      timer = setTimeout(() => {
        timer = null;
        switchTo(tabId);
      }, TAB_HOVER_SWITCH_DELAY_MS);
    },
    cancel() {
      clear();
      hoveredTabId = null;
    },
  };
}

export function useShowSplitTabLayout() {
  const navigate = useNavigate();
  return (layout: SplitLayout | null) => {
    const route = layout === null ? null : focusedPaneRoute(layout);
    if (route !== null) navigate(route, { replace: true });
  };
}

function SplitTabRenameInput({
  initialName,
  onDone,
}: {
  initialName: string;
  onDone: (name: string | null) => void;
}) {
  const isDone = useRef(false);
  const finish = (name: string | null) => {
    if (isDone.current) return;
    isDone.current = true;
    onDone(name);
  };
  return (
    <input
      autoFocus
      aria-label="Tab name"
      defaultValue={initialName}
      className="min-w-0 flex-1 bg-transparent text-xs outline-none"
      onFocus={(event) => event.currentTarget.select()}
      onPointerDown={(event) => event.stopPropagation()}
      onBlur={(event) => finish(event.currentTarget.value)}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
        if (event.key === "Escape") finish(null);
      }}
    />
  );
}

function NewProjectTabPicker({ onDone }: { onDone: () => void }) {
  const store = useStore();
  const navigate = useNavigate();
  const navigation = useSidebarNavigation();
  const projects = useMemo(
    () =>
      navigation.data === undefined
        ? []
        : [navigation.data.personalProject, ...navigation.data.projects],
    [navigation.data],
  );
  return (
    <ProjectSelector
      defaultOpen
      projects={projects}
      value={null}
      isLoading={navigation.data === undefined}
      onOpenChange={(open) => {
        if (!open) onDone();
      }}
      onChange={(projectId) => {
        if (projectId !== null) openComposeTab(store, navigate, projectId);
      }}
    />
  );
}

function SplitTabCommandHandlers({
  onPickProject,
}: {
  onPickProject: () => void;
}) {
  const store = useStore();
  const navigate = useNavigate();
  const show = useShowSplitTabLayout();
  useAppCommandHandler("splitTab.new", () => {
    openComposeTab(store, navigate);
    return true;
  });
  useAppCommandHandler("splitTab.newForProject", () => {
    onPickProject();
    return true;
  });
  useAppCommandHandler("splitTab.reopenClosed", () => {
    show(store.set(reopenClosedSplitItemAtom));
    return true;
  });
  const hasPinnedTab = usePinnedTabPanel() !== null;
  useIndexedAppCommandHandlers(SPLIT_TAB_SELECT_APP_COMMAND_IDS, (index) => {
    if (index === 0) {
      if (!hasPinnedTab) return false;
      navigate(PINNED_TAB_ROUTE_PATH);
      return true;
    }
    const tab = store.get(splitTabsAtom).tabs[index - 1];
    if (tab === undefined) return false;
    show(store.set(selectSplitTabAtom, tab.id));
    return true;
  });
  return null;
}

function TabShell({
  isActive,
  onSelect,
  noDragClassName,
  dropTabId,
  className,
  children,
  ...props
}: Omit<ComponentProps<"div">, "onSelect"> & {
  isActive: boolean;
  onSelect: (event: ReactPointerEvent<HTMLDivElement>) => void;
  noDragClassName: string | false;
  dropTabId?: string;
}) {
  return (
    <div
      {...props}
      role="tab"
      aria-selected={isActive}
      {...(dropTabId === undefined || isActive
        ? {}
        : { [SPLIT_TAB_DROP_ATTR]: dropTabId })}
      className={cn(
        "flex shrink-0 cursor-default items-center gap-1 select-none",
        noDragClassName,
        className,
      )}
      onPointerDown={(event) => {
        props.onPointerDown?.(event);
        if (event.button === 0) onSelect(event);
      }}
    >
      {children}
    </div>
  );
}

function SplitTabItem({
  tab,
  layout,
  isActive,
  activeTabRef,
  command,
  shortcut,
  isRenaming,
  noDragClassName,
  hasTabsToRight,
  hasOtherTabs,
  onSelect,
  onRename,
  onRenameDone,
  onClose,
  onCloseOthers,
  onCloseRight,
}: {
  tab: SplitTab;
  layout: SplitLayout | null;
  isActive: boolean;
  activeTabRef: RefObject<HTMLDivElement | null>;
  command: string | undefined;
  shortcut: AppShortcutPresentation | null;
  isRenaming: boolean;
  noDragClassName: string | false;
  hasTabsToRight: boolean;
  hasOtherTabs: boolean;
  onSelect: (event: ReactPointerEvent<HTMLDivElement>) => void;
  onRename: () => void;
  onRenameDone: (name: string | null) => void;
  onClose: () => void;
  onCloseOthers: () => void;
  onCloseRight: () => void;
}) {
  const { title, isProjectName } = useSplitTabTitle(layout, tab.name);
  const dot = useSplitTabDot(layout);
  const extraPanes = layout === null ? 0 : countPanes(layout.root) - 1;
  return (
    <ContextMenu modal={false}>
      <Tooltip>
        <ContextMenuTrigger asChild disabled={isRenaming}>
          <TooltipTrigger asChild>
            <TabShell
              ref={isActive ? activeTabRef : undefined}
              {...{ [SPLIT_TAB_ID_ATTR]: tab.id }}
              isActive={isActive}
              noDragClassName={noDragClassName}
              dropTabId={tab.id}
              onSelect={(event) => {
                if (!isRenaming) onSelect(event);
              }}
              onDoubleClick={onRename}
            >
              {isRenaming ? (
                <div
                  className={cn(
                    "flex h-7 w-40 items-center rounded-md px-2",
                    CONTEXT_SELECTION_SURFACE_CLASS,
                  )}
                >
                  <SplitTabRenameInput
                    initialName={title}
                    onDone={onRenameDone}
                  />
                </div>
              ) : (
                <TabPill
                  label={title}
                  title={title}
                  leadingVisual={
                    dot === null ? (
                      <Icon name="MessageSquare" />
                    ) : (
                      <ThreadStatusDot dot={dot} />
                    )
                  }
                  secondaryLabel={
                    !isProjectName && extraPanes > 0 ? `+${extraPanes}` : null
                  }
                  isActive={isActive}
                  onSelect={() => undefined}
                  labelMaxWidthClass="max-w-[160px]"
                  closeAction={{ onClose, closeLabel: `Close ${title}` }}
                />
              )}
              {command === undefined ? null : (
                <AppCommandShortcutHint shortcut={shortcut} />
              )}
            </TabShell>
          </TooltipTrigger>
        </ContextMenuTrigger>
        {isRenaming ? null : (
          <TooltipContent side="bottom" align="start">
            <SplitTabTooltip layout={layout} title={title} />
          </TooltipContent>
        )}
      </Tooltip>
      <ContextMenuContent aria-label={`${title} tab actions`}>
        <ContextMenuItem onSelect={onRename}>Rename tab</ContextMenuItem>
        <ContextMenuItem onSelect={onClose}>Close tab</ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem disabled={!hasOtherTabs} onSelect={onCloseOthers}>
          Close other tabs
        </ContextMenuItem>
        <ContextMenuItem disabled={!hasTabsToRight} onSelect={onCloseRight}>
          Close tabs to the right
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const TRAFFIC_LIGHT_RESERVE_CLASS =
  "pl-[max(0px,calc(var(--bb-window-title-bar-controls-end)_+_12px_-_1rem_-_var(--bb-split-tab-bar-left,0px)))]";

const SIDEBAR_ANIMATION_TRACK_MS = 300;

function useWindowLeftEdgeVariable(
  enabled: boolean,
  isSidebarShowing: boolean,
) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!enabled || bar === null) return;
    const update = () =>
      bar.style.setProperty(
        "--bb-split-tab-bar-left",
        `${bar.getBoundingClientRect().left}px`,
      );
    update();
    const observer = new ResizeObserver(update);
    observer.observe(bar);
    return () => observer.disconnect();
  }, [enabled]);
  useLayoutEffect(() => {
    const bar = ref.current;
    if (!enabled || bar === null) return;
    const until = performance.now() + SIDEBAR_ANIMATION_TRACK_MS;
    let frame = 0;
    const track = () => {
      bar.style.setProperty(
        "--bb-split-tab-bar-left",
        `${bar.getBoundingClientRect().left}px`,
      );
      if (performance.now() < until) frame = requestAnimationFrame(track);
    };
    frame = requestAnimationFrame(track);
    return () => cancelAnimationFrame(frame);
  }, [enabled, isSidebarShowing]);
  return ref;
}

export function SplitTabBar() {
  const state = useAtomValue(splitTabsAtom);
  const activeLayout = useAtomValue(splitLayoutAtom);
  const shortcuts = useAppCommandShortcuts(SPLIT_TAB_SELECT_APP_COMMAND_IDS);
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const show = useShowSplitTabLayout();
  const pinnedTab = usePinnedTabPanel();
  const isPinnedTab = location.pathname === PINNED_TAB_ROUTE_PATH;
  const [renamingTabId, setRenamingTabId] = useState<string | null>(null);
  const [isPickingProject, setIsPickingProject] = useState(false);
  const beginTabReorder = (event: ReactPointerEvent, tabId: string) => {
    const startX = event.clientX;
    let engaged = false;
    const handleMove = (move: PointerEvent) => {
      if (!engaged) {
        if (Math.abs(move.clientX - startX) <= TAB_DRAG_ENGAGE_DISTANCE_PX) {
          return;
        }
        engaged = true;
        document.body.style.cursor = "grabbing";
      }
      const others = [
        ...(contentRef.current?.querySelectorAll<HTMLElement>(
          `[${SPLIT_TAB_ID_ATTR}]`,
        ) ?? []),
      ].filter((element) => element.getAttribute(SPLIT_TAB_ID_ATTR) !== tabId);
      const toIndex = others.filter((element) => {
        const rect = element.getBoundingClientRect();
        return rect.left + rect.width / 2 < move.clientX;
      }).length;
      store.set(moveSplitTabAtom, { tabId, toIndex });
    };
    const handleEnd = () => {
      window.removeEventListener("pointermove", handleMove);
      window.removeEventListener("pointerup", handleEnd);
      window.removeEventListener("pointercancel", handleEnd);
      if (engaged) document.body.style.cursor = "";
    };
    window.addEventListener("pointermove", handleMove);
    window.addEventListener("pointerup", handleEnd);
    window.addEventListener("pointercancel", handleEnd);
  };
  const closeTabs = (tabIds: readonly string[]) => {
    for (const tabId of tabIds) show(store.set(closeSplitTabAtom, tabId));
  };
  const pinnedTabCommand = SPLIT_TAB_SELECT_APP_COMMAND_IDS[0];
  const isInTitleBar = useIsSidebarFramed();
  const barRef = useWindowLeftEdgeVariable(isInTitleBar, useIsSidebarShowing());
  const hidesChromeToggles = useUsesSwipeChrome();
  const [desktopInfo] = useState(getBbDesktopInfo);
  const usesDesktopChrome = shouldUseMacosDesktopChrome(desktopInfo);
  const noDragClassName = usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS;
  const { stripRef, viewportRef, contentRef, activeTabRef, overflow } =
    useTabStripOverflow({
      activeKey: isPinnedTab ? null : state.activeTabId,
      contentKey: state.tabs,
    });
  return (
    <div
      ref={barRef}
      role="tablist"
      className={cn(
        "-mx-4 -mt-4 mb-4 flex shrink-0 items-center gap-1 px-1 md:-mx-5 md:-mt-5 md:mb-5",
        !hidesChromeToggles && "pr-12",
        isInTitleBar
          ? [MACOS_TITLE_BAR_ROW_CLASS, TRAFFIC_LIGHT_RESERVE_CLASS]
          : "h-7 border-b border-border",
        usesDesktopChrome && MACOS_WINDOW_DRAG_CLASS,
      )}
    >
      <SplitTabCommandHandlers
        onPickProject={() => setIsPickingProject(true)}
      />
      {pinnedTab === null ? null : (
        <TabShell
          isActive={isPinnedTab}
          noDragClassName={noDragClassName}
          onSelect={() => navigate(PINNED_TAB_ROUTE_PATH)}
        >
          <TabPill
            label={pinnedTab.title}
            title={pinnedTab.title}
            leadingVisual={<Icon name={pinnedTab.icon} />}
            isActive={isPinnedTab}
            onSelect={() => navigate(PINNED_TAB_ROUTE_PATH)}
            closeAction={null}
          />
          <AppCommandShortcutHint
            shortcut={shortcuts.get(pinnedTabCommand) ?? null}
          />
        </TabShell>
      )}
      <div ref={stripRef} className="relative flex min-w-0 items-center">
        <OverflowFade
          placement="left"
          className={cn(
            "z-10",
            overflow.canScrollLeft ? "opacity-100" : "opacity-0",
          )}
        />
        <OverflowFade
          placement="right"
          className={cn(
            "z-10",
            overflow.canScrollRight ? "opacity-100" : "opacity-0",
          )}
        />
        <div
          ref={viewportRef}
          data-split-tab-scroll-viewport
          className={cn(
            "no-scrollbar flex min-w-0 items-center overflow-x-auto overflow-y-hidden",
            usesDesktopChrome && MACOS_APP_REGION_NO_DRAG_CLASS,
          )}
        >
          <div ref={contentRef} className="flex w-max items-center gap-1">
            {state.tabs.map((tab, index) => {
              const command = SPLIT_TAB_SELECT_APP_COMMAND_IDS[index + 1];
              return (
                <SplitTabItem
                  key={tab.id}
                  tab={tab}
                  layout={
                    tab.id === state.activeTabId ? activeLayout : tab.layout
                  }
                  isActive={!isPinnedTab && tab.id === state.activeTabId}
                  activeTabRef={activeTabRef}
                  command={command}
                  shortcut={
                    command === undefined
                      ? null
                      : (shortcuts.get(command) ?? null)
                  }
                  hasOtherTabs={state.tabs.length > 1}
                  hasTabsToRight={index < state.tabs.length - 1}
                  isRenaming={renamingTabId === tab.id}
                  noDragClassName={noDragClassName}
                  onSelect={(event) => {
                    show(store.set(selectSplitTabAtom, tab.id));
                    beginTabReorder(event, tab.id);
                  }}
                  onRename={() => setRenamingTabId(tab.id)}
                  onRenameDone={(name) => {
                    setRenamingTabId(null);
                    if (name !== null) {
                      store.set(renameSplitTabAtom, { tabId: tab.id, name });
                    }
                  }}
                  onClose={() => closeTabs([tab.id])}
                  onCloseOthers={() => {
                    show(store.set(selectSplitTabAtom, tab.id));
                    closeTabs(
                      state.tabs
                        .filter((other) => other.id !== tab.id)
                        .map((other) => other.id),
                    );
                  }}
                  onCloseRight={() =>
                    closeTabs(state.tabs.slice(index + 1).map((t) => t.id))
                  }
                />
              );
            })}
          </div>
        </div>
      </div>
      <button
        type="button"
        aria-label="New tab"
        {...{ [SPLIT_TAB_DROP_ATTR]: NEW_TAB_DROP_VALUE }}
        className={cn(
          "flex w-7 shrink-0 items-center justify-center",
          CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
          noDragClassName,
        )}
        onClick={() => openComposeTab(store, navigate)}
      >
        <Icon name="Plus" className="size-3" />
      </button>
      {isPickingProject ? (
        <div className={cn("flex items-center", noDragClassName)}>
          <NewProjectTabPicker onDone={() => setIsPickingProject(false)} />
        </div>
      ) : null}
    </div>
  );
}
