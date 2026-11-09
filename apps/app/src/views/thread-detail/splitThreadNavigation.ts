import type { ThreadRoutePathArgs } from "@/lib/route-paths";
import type { ThreadOpenSplit, ThreadPaneAction } from "@bb/server-contract";
import {
  countPanes,
  findPane,
  findPaneByContent,
  findPaneByThread,
  isSamePaneContent,
  MAX_PANES,
  replacePaneContent,
  setFocus,
  splitPane,
} from "@/lib/split-layout";
import type { useStore } from "jotai";
import {
  insertSplitTab,
  openInboxTabAtom,
  openSplitTabAtom,
  selectSplitTab,
  tabAcceptsContent,
  tabProjectId,
  type SplitTab,
  type SplitTabsState,
} from "@/lib/split-layout/tabs";
import { decideThreadDrop, type SplitZone } from "@/lib/split-drag";
import type { PaneContent, SplitLayout } from "@/lib/split-layout";
import { matchPath } from "react-router-dom";
import { PERSONAL_PROJECT_ID } from "@bb/domain";
import {
  APP_ROOT_ROUTE_PATH,
  getPluginDetailRoutePath,
  getPluginPanelRoutePath,
  getRootComposeRoutePath,
  getThreadRoutePath,
  PLUGIN_DETAIL_ROUTE_PATH,
  PLUGIN_PANEL_ROUTE_PATH,
} from "@/lib/route-paths";

const FIRST_PANE_ID = "pane-1";
const SPLITTABLE_THREAD_ROUTE_PATH = "/projects/:projectId/threads/:threadId";
const SPLITTABLE_PERSONAL_THREAD_ROUTE_PATH = "/threads/:threadId";
export const THREAD_PANEL_TAB_SEARCH_PARAM = "panelTab";

export function threadPaneContent(thread: ThreadRoutePathArgs): PaneContent {
  return {
    kind: "thread",
    projectId: thread.projectId,
    threadId: thread.threadId,
  };
}

export function createSinglePaneLayout(
  thread: ThreadRoutePathArgs,
): SplitLayout {
  return {
    root: {
      type: "pane",
      paneId: FIRST_PANE_ID,
      content: threadPaneContent(thread),
    },
    focusedPaneId: FIRST_PANE_ID,
  };
}

function createSinglePaneContentLayout(content: PaneContent): SplitLayout {
  return {
    root: { type: "pane", paneId: FIRST_PANE_ID, content },
    focusedPaneId: FIRST_PANE_ID,
  };
}

export function paneContentRoute(content: PaneContent): string {
  if (content.kind === "thread") {
    return getThreadRoutePath(content);
  }
  if (content.kind === "thread-panel-tab") {
    const search = new URLSearchParams({
      [THREAD_PANEL_TAB_SEARCH_PARAM]: content.tabId,
    });
    return `${getThreadRoutePath(content)}?${search.toString()}`;
  }
  if (content.kind === "new-thread") {
    return getRootComposeRoutePath();
  }
  if (content.kind === "plugin-detail") {
    return getPluginDetailRoutePath({ pluginId: content.pluginId });
  }
  const panelRoute = getPluginPanelRoutePath({
    pluginId: content.pluginId,
    path: content.panelPath,
  });
  return content.subPath === ""
    ? panelRoute
    : `${panelRoute}/${content.subPath}`;
}

function decodePluginRouteParam(value: string): string {
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

export function paneContentForPathname(pathname: string): PaneContent | null {
  if (pathname === APP_ROOT_ROUTE_PATH) {
    return { kind: "new-thread" };
  }
  const thread = matchPath(
    { path: SPLITTABLE_THREAD_ROUTE_PATH, end: false },
    pathname,
  );
  if (thread?.params.projectId && thread.params.threadId) {
    return {
      kind: "thread",
      projectId: thread.params.projectId,
      threadId: thread.params.threadId,
    };
  }
  const personalThread = matchPath(
    { path: SPLITTABLE_PERSONAL_THREAD_ROUTE_PATH, end: false },
    pathname,
  );
  if (personalThread?.params.threadId) {
    return {
      kind: "thread",
      projectId: PERSONAL_PROJECT_ID,
      threadId: personalThread.params.threadId,
    };
  }
  const detail = matchPath(PLUGIN_DETAIL_ROUTE_PATH, pathname);
  if (detail?.params.pluginId) {
    return {
      kind: "plugin-detail",
      pluginId: decodePluginRouteParam(detail.params.pluginId),
    };
  }
  const panel = matchPath(PLUGIN_PANEL_ROUTE_PATH, pathname);
  if (panel?.params.pluginId && panel.params.panelPath) {
    return {
      kind: "plugin-panel",
      pluginId: decodePluginRouteParam(panel.params.pluginId),
      panelPath: decodePluginRouteParam(panel.params.panelPath),
      subPath: panel.params["*"] ?? "",
    };
  }
  return null;
}

export function reconcileLayoutForContent(
  layout: SplitLayout | null,
  content: PaneContent,
): SplitLayout {
  if (layout === null) {
    return createSinglePaneContentLayout(content);
  }
  const focused = findPane(layout.root, layout.focusedPaneId);
  const existing =
    focused !== null && isSamePaneContent(focused.content, content)
      ? focused
      : findPaneByContent(layout.root, content);
  if (existing !== null) {
    const withRouteState =
      existing.content.kind === "plugin-panel" &&
      content.kind === "plugin-panel" &&
      existing.content.subPath !== content.subPath
        ? replacePaneContent(layout, existing.paneId, content)
        : layout;
    return withRouteState.focusedPaneId === existing.paneId
      ? withRouteState
      : setFocus(withRouteState, existing.paneId);
  }
  return replacePaneContent(layout, layout.focusedPaneId, content);
}

export function placeThreadBesideSplit(
  state: SplitTabsState,
  activeLayout: SplitLayout | null,
  thread: ThreadRoutePathArgs,
): { state: SplitTabsState; layout: SplitLayout } | null {
  if (activeLayout === null || countPanes(activeLayout.root) < 2) return null;
  if (
    findPaneByThread(activeLayout.root, thread.projectId, thread.threadId) !==
    null
  ) {
    return null;
  }
  const focused = findPane(activeLayout.root, activeLayout.focusedPaneId);
  if (focused === null || focused.content.kind === "new-thread") return null;
  const layout = createSinglePaneLayout(thread);
  const content = threadPaneContent(thread);
  const target = state.tabs.find(
    (tab) =>
      tab.id !== state.activeTabId &&
      tab.kind !== "inbox" &&
      tabAcceptsContent(tab, tab.layout, content) &&
      hasRoomForThread(tab),
  );
  const next =
    target === undefined
      ? insertSplitTab(state, activeLayout, layout, thread.projectId)
      : selectSplitTab(state, activeLayout, target.id);
  if (next === null) return null;
  return {
    state: {
      ...next,
      tabs: next.tabs.map((tab) =>
        tab.id === next.activeTabId
          ? { ...tab, layout, projectId: thread.projectId }
          : tab,
      ),
    },
    layout,
  };
}

function hasRoomForThread(tab: SplitTab): boolean {
  return tab.layout === null || countPanes(tab.layout.root) === 1;
}

export function placeThreadInProjectTab(
  state: SplitTabsState,
  activeLayout: SplitLayout | null,
  thread: ThreadRoutePathArgs,
): { state: SplitTabsState; layout: SplitLayout } | null {
  const active = state.tabs.find((tab) => tab.id === state.activeTabId);
  const content = threadPaneContent(thread);
  if (
    active === undefined ||
    tabAcceptsContent(active, activeLayout, content)
  ) {
    return null;
  }
  const target = state.tabs.find(
    (tab) =>
      tab.id !== state.activeTabId &&
      tabProjectId(tab) === thread.projectId &&
      hasRoomForThread(tab),
  );
  if (target === undefined) {
    const layout = createSinglePaneLayout(thread);
    const next = insertSplitTab(state, activeLayout, layout, thread.projectId);
    return next === null ? null : { state: next, layout };
  }
  const layout = reconcileLayoutForContent(target.layout, content);
  const next = selectSplitTab(state, activeLayout, target.id);
  if (next === null) return null;
  return {
    state: {
      ...next,
      tabs: next.tabs.map((tab) =>
        tab.id === target.id
          ? { ...tab, layout, projectId: thread.projectId }
          : tab,
      ),
    },
    layout,
  };
}

export function replaceOriginPaneContent(
  layout: SplitLayout,
  paneId: string,
  originContent: PaneContent,
  content: PaneContent,
): SplitLayout | null {
  const pane = findPane(layout.root, paneId);
  if (pane === null || !isSamePaneContent(pane.content, originContent)) {
    return null;
  }
  return {
    ...replacePaneContent(layout, paneId, content),
    focusedPaneId: layout.focusedPaneId,
  };
}

export function openComposeTab(
  store: ReturnType<typeof useStore>,
  navigate: (route: string, options: { replace: true }) => void,
  projectId: string | null = null,
): void {
  const layout = store.set(openSplitTabAtom, projectId);
  const route = layout === null ? null : focusedPaneRoute(layout);
  if (route !== null) navigate(route, { replace: true });
}

export function openInboxTab(
  store: ReturnType<typeof useStore>,
  navigate: (route: string, options: { replace: true }) => void,
): void {
  const layout = store.set(openInboxTabAtom);
  const route = layout === null ? null : focusedPaneRoute(layout);
  if (route !== null) navigate(route, { replace: true });
}

export function focusedPaneRoute(layout: SplitLayout): string | null {
  const focused = findPane(layout.root, layout.focusedPaneId);
  return focused === null ? null : paneContentRoute(focused.content);
}

function threadOpenSplitZone(split: ThreadOpenSplit): SplitZone {
  return split === "replace" ? "center" : split === "down" ? "bottom" : split;
}

export function applyThreadOpenToLayout(
  layout: SplitLayout | null,
  thread: ThreadRoutePathArgs,
  split: ThreadOpenSplit,
): SplitLayout {
  if (layout === null) {
    return createSinglePaneLayout(thread);
  }
  const existing = findPaneByThread(
    layout.root,
    thread.projectId,
    thread.threadId,
  );
  const decision = decideThreadDrop({
    zone: threadOpenSplitZone(split),
    threadAlreadyOpen: existing !== null,
    atMaxPanes: countPanes(layout.root) >= MAX_PANES,
  });
  if (existing !== null) {
    return layout.focusedPaneId === existing.paneId
      ? layout
      : setFocus(layout, existing.paneId);
  }
  const content = threadPaneContent(thread);
  return decision.zone === "center"
    ? replacePaneContent(layout, layout.focusedPaneId, content)
    : splitPane(layout, layout.focusedPaneId, decision.zone, content);
}

interface ThreadPaneActionLayoutResult {
  layout: SplitLayout;
  maximizedPaneId: string | null;
  dimInactiveSplits: boolean | null;
}

export function applyThreadPaneActionToLayout(
  layout: SplitLayout,
  maximizedPaneId: string | null,
  thread: ThreadRoutePathArgs,
  action: ThreadPaneAction,
): ThreadPaneActionLayoutResult {
  const pane = findPaneByThread(layout.root, thread.projectId, thread.threadId);
  if (pane === null || countPanes(layout.root) < 2) {
    return { layout, maximizedPaneId, dimInactiveSplits: null };
  }
  if (action === "spotlight" || action === "clear-spotlight") {
    return {
      layout:
        layout.focusedPaneId === pane.paneId
          ? layout
          : setFocus(layout, pane.paneId),
      maximizedPaneId,
      dimInactiveSplits: action === "spotlight",
    };
  }
  if (action === "restore") {
    return {
      layout,
      maximizedPaneId: maximizedPaneId === pane.paneId ? null : maximizedPaneId,
      dimInactiveSplits: null,
    };
  }
  if (action === "toggle" && maximizedPaneId === pane.paneId) {
    return { layout, maximizedPaneId: null, dimInactiveSplits: null };
  }
  return {
    layout:
      layout.focusedPaneId === pane.paneId
        ? layout
        : setFocus(layout, pane.paneId),
    maximizedPaneId: pane.paneId,
    dimInactiveSplits: null,
  };
}
