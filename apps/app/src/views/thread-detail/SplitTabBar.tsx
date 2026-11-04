import {
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { useAtomValue, useStore } from "jotai";
import { useLocation, useNavigate } from "react-router-dom";
import { SPLIT_TAB_SELECT_APP_COMMAND_IDS } from "@bb/domain";
import { Icon } from "@bb/shared-ui/icon";
import { cn } from "@bb/shared-ui/lib/utils";
import { CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS } from "@bb/shared-ui/chrome-style-tokens";
import {
  CONTEXT_INACTIVE_TEXT_CLASS,
  CONTEXT_SELECTION_SURFACE_CLASS,
} from "@bb/shared-ui/context-selection";
import { useThread } from "@/hooks/queries/thread-queries";
import { useSidebarNavigation } from "@/hooks/queries/sidebar-navigation-query";
import { ProjectSelector } from "@/components/pickers/ProjectSelector";
import {
  useAppCommandHandler,
  useAppCommandShortcuts,
  useIndexedAppCommandHandlers,
} from "@/components/commands/AppCommandProvider";
import { AppCommandShortcutHint } from "@/components/commands/AppCommandShortcutHint";
import { HOME_ROUTE_PATH } from "@/lib/route-paths";
import {
  useIsSidebarFramed,
  useIsSidebarShowing,
} from "@/components/ui/sidebar.js";
import { useIsCompactViewport } from "@bb/shared-ui/hooks/use-compact-viewport";
import {
  getBbDesktopInfo,
  MACOS_TITLE_BAR_COLLAPSED_SIDEBAR_RESERVE_CLASS,
  MACOS_TITLE_BAR_ROW_CLASS,
  MACOS_WINDOW_DRAG_CLASS,
  MACOS_WINDOW_NO_DRAG_CLASS,
  shouldUseMacosDesktopChrome,
} from "@/lib/bb-desktop";
import { splitLayoutAtom } from "@/lib/split-layout/atoms";
import {
  beginSplitDrag,
  type AuxiliaryDropTarget,
} from "@/lib/split-drag/splitDragSession";
import { countPanes, findPane, listPanes } from "@/lib/split-layout";
import {
  mostUrgentThreadDot,
  ThreadStatusDot,
  useThreadDescendants,
  useThreadEntriesById,
} from "@/components/thread/ThreadStatusDot";
import { homeThreadDot } from "@/views/home-overview";
import type { SplitLayout } from "@/lib/split-layout";
import {
  closeSplitTabAtom,
  movePaneToTabAtom,
  openSplitTabAtom,
  renameSplitTabAtom,
  reopenClosedSplitItemAtom,
  selectSplitTabAtom,
  splitTabsAtom,
} from "@/lib/split-layout/tabs";
import { focusedPaneRoute } from "./splitThreadNavigation";

function SplitTabTitle({
  layout,
  name,
}: {
  layout: SplitLayout | null;
  name: string | null;
}) {
  const focused =
    layout === null ? null : findPane(layout.root, layout.focusedPaneId);
  const threadId =
    focused?.content.kind === "thread" ||
    focused?.content.kind === "thread-panel-tab"
      ? focused.content.threadId
      : "";
  const thread = useThread(threadId);
  const title =
    name ??
    (focused === null || focused.content.kind === "new-thread"
      ? "New thread"
      : focused.content.kind === "thread" ||
          focused.content.kind === "thread-panel-tab"
        ? (thread.data?.title ?? "Thread")
        : "Extension");
  const extraPanes = layout === null ? 0 : countPanes(layout.root) - 1;
  const entries = useThreadEntriesById();
  const descendants = useThreadDescendants();
  const dot = mostUrgentThreadDot(
    layout === null
      ? []
      : listPanes(layout.root).map((pane) => {
          const entry =
            pane.content.kind === "thread"
              ? entries.get(pane.content.threadId)
              : undefined;
          return entry === undefined ? null : homeThreadDot(entry, descendants);
        }),
  );
  return (
    <>
      <ThreadStatusDot dot={dot} />
      <span className="min-w-0 truncate">{title}</span>
      {extraPanes > 0 ? (
        <span className={CONTEXT_INACTIVE_TEXT_CLASS}>+{extraPanes}</span>
      ) : null}
    </>
  );
}

const SPLIT_TAB_DROP_ATTR = "data-split-tab-drop";
const NEW_TAB_DROP_VALUE = "new";
const TAB_DRAG_ENGAGE_DISTANCE_PX = 6;

export function resolveSplitTabDropTarget(
  x: number,
  y: number,
  drop: (tabId: string | null) => void,
  { allowNewTab = true }: { allowNewTab?: boolean } = {},
): AuxiliaryDropTarget | null {
  for (const element of document.elementsFromPoint(x, y)) {
    const target =
      element instanceof HTMLElement
        ? element.closest<HTMLElement>(`[${SPLIT_TAB_DROP_ATTR}]`)
        : null;
    const value = target?.getAttribute(SPLIT_TAB_DROP_ATTR);
    if (target == null || value == null) continue;
    const isNewTab = value === NEW_TAB_DROP_VALUE;
    if (isNewTab && !allowNewTab) return null;
    return {
      element: target,
      label: isNewTab ? "Move to new tab" : "Move to tab",
      drop: () => drop(isNewTab ? null : value),
    };
  }
  return null;
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
  const show = useShowSplitTabLayout();
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
        if (projectId !== null) show(store.set(openSplitTabAtom, projectId));
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
    show(store.set(openSplitTabAtom));
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
  useIndexedAppCommandHandlers(SPLIT_TAB_SELECT_APP_COMMAND_IDS, (index) => {
    if (index === 0) {
      navigate(HOME_ROUTE_PATH);
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
  children,
}: {
  isActive: boolean;
  onSelect: (event: ReactPointerEvent) => void;
  noDragClassName: string | false;
  dropTabId?: string;
  children: ReactNode;
}) {
  return (
    <div
      role="tab"
      aria-selected={isActive}
      {...(dropTabId === undefined || isActive
        ? {}
        : { [SPLIT_TAB_DROP_ATTR]: dropTabId })}
      className={cn(
        "group flex min-w-0 max-w-44 cursor-default items-center gap-1.5 border-r border-border px-2 text-xs select-none",
        noDragClassName,
        isActive
          ? CONTEXT_SELECTION_SURFACE_CLASS
          : CONTEXT_INACTIVE_TEXT_CLASS,
      )}
      onPointerDown={(event) => {
        if (event.button === 0) onSelect(event);
      }}
    >
      {children}
    </div>
  );
}

export function SplitTabBar() {
  const state = useAtomValue(splitTabsAtom);
  const activeLayout = useAtomValue(splitLayoutAtom);
  const shortcuts = useAppCommandShortcuts(SPLIT_TAB_SELECT_APP_COMMAND_IDS);
  const store = useStore();
  const navigate = useNavigate();
  const location = useLocation();
  const show = useShowSplitTabLayout();
  const isHome = location.pathname === HOME_ROUTE_PATH;
  const [renaming, setRenaming] = useState<{
    tabId: string;
    title: string;
  } | null>(null);
  const [isPickingProject, setIsPickingProject] = useState(false);
  const beginTabDrag = (event: ReactPointerEvent, label: string) => {
    const layout = store.get(splitLayoutAtom);
    if (layout === null || countPanes(layout.root) !== 1) return;
    const paneId = layout.focusedPaneId;
    if (findPane(layout.root, paneId)?.content.kind === "new-thread") return;
    const startX = event.clientX;
    const startY = event.clientY;
    beginSplitDrag({
      ghostLabel: label,
      shouldEngage: (x, y) =>
        Math.hypot(x - startX, y - startY) > TAB_DRAG_ENGAGE_DISTANCE_PX,
      resolveAuxiliaryTarget: (x, y) =>
        resolveSplitTabDropTarget(
          x,
          y,
          (tabId) => show(store.set(movePaneToTabAtom, { paneId, tabId })),
          { allowNewTab: false },
        ),
      decide: () => null,
      onDrop: () => undefined,
    });
  };
  const homeCommand = SPLIT_TAB_SELECT_APP_COMMAND_IDS[0];
  const isInTitleBar = useIsSidebarFramed();
  const isSidebarShowing = useIsSidebarShowing();
  const isCompactViewport = useIsCompactViewport();
  const [desktopInfo] = useState(getBbDesktopInfo);
  const usesDesktopChrome = shouldUseMacosDesktopChrome(desktopInfo);
  const noDragClassName = usesDesktopChrome && MACOS_WINDOW_NO_DRAG_CLASS;
  return (
    <div
      role="tablist"
      className={cn(
        "-mx-4 -mt-4 mb-4 flex shrink-0 items-stretch overflow-x-auto md:-mx-5 md:-mt-5 md:mb-5 pr-12",
        isInTitleBar
          ? [
              MACOS_TITLE_BAR_ROW_CLASS,
              (isCompactViewport || !isSidebarShowing) &&
                MACOS_TITLE_BAR_COLLAPSED_SIDEBAR_RESERVE_CLASS,
            ]
          : "h-7 border-b border-border",
        usesDesktopChrome && MACOS_WINDOW_DRAG_CLASS,
      )}
    >
      <SplitTabCommandHandlers
        onPickProject={() => setIsPickingProject(true)}
      />
      <TabShell
        isActive={isHome}
        noDragClassName={noDragClassName}
        onSelect={() => navigate(HOME_ROUTE_PATH)}
      >
        <Icon name="Home" className="size-3" />
        <span>Home</span>
        <AppCommandShortcutHint shortcut={shortcuts.get(homeCommand) ?? null} />
      </TabShell>
      {state.tabs.map((tab, index) => {
        const isActive = !isHome && tab.id === state.activeTabId;
        const command = SPLIT_TAB_SELECT_APP_COMMAND_IDS[index + 1];
        return (
          <TabShell
            key={tab.id}
            isActive={isActive}
            noDragClassName={noDragClassName}
            dropTabId={tab.id}
            onSelect={(event) => {
              if (renaming?.tabId === tab.id) return;
              show(store.set(selectSplitTabAtom, tab.id));
              beginTabDrag(event, event.currentTarget.textContent ?? "Thread");
            }}
          >
            <div
              className="flex min-w-0 flex-1 items-center gap-1.5"
              title="Double click to rename"
              onDoubleClick={(event) =>
                setRenaming({
                  tabId: tab.id,
                  title:
                    event.currentTarget.querySelector("span")?.textContent ??
                    "",
                })
              }
              onAuxClick={(event) => {
                if (event.button === 1) {
                  show(store.set(closeSplitTabAtom, tab.id));
                }
              }}
            >
              {renaming?.tabId === tab.id ? (
                <SplitTabRenameInput
                  initialName={renaming.title}
                  onDone={(name) => {
                    setRenaming(null);
                    if (name !== null) {
                      store.set(renameSplitTabAtom, { tabId: tab.id, name });
                    }
                  }}
                />
              ) : (
                <SplitTabTitle
                  name={tab.name}
                  layout={
                    tab.id === state.activeTabId ? activeLayout : tab.layout
                  }
                />
              )}
            </div>
            <span className="ml-auto flex shrink-0 items-center gap-1">
              {command === undefined ? null : (
                <AppCommandShortcutHint
                  shortcut={shortcuts.get(command) ?? null}
                />
              )}
              {state.tabs.length > 1 ? (
                <button
                  type="button"
                  aria-label="Close tab"
                  className={cn(
                    "flex size-4 items-center justify-center rounded opacity-0 group-hover:opacity-100",
                    CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
                  )}
                  onPointerDown={(event) => event.stopPropagation()}
                  onClick={() => show(store.set(closeSplitTabAtom, tab.id))}
                >
                  <Icon name="CloseThreadPane" className="size-3" />
                </button>
              ) : null}
            </span>
          </TabShell>
        );
      })}
      <button
        type="button"
        aria-label="New tab"
        {...{ [SPLIT_TAB_DROP_ATTR]: NEW_TAB_DROP_VALUE }}
        className={cn(
          "flex w-7 shrink-0 items-center justify-center",
          CHROME_SUBTLE_ICON_BUTTON_FOREGROUND_CLASS,
          noDragClassName,
        )}
        onClick={() => show(store.set(openSplitTabAtom))}
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
