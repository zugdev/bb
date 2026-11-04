import { atom, type Setter } from "jotai";
import { atomWithStorage } from "jotai/utils";
import { z } from "zod";
import { createTabScopedStorage } from "@/lib/browser-storage";
import { rootComposeProjectIdAtom } from "@/lib/root-compose-selection";
import { maximizedPaneIdAtom, splitLayoutAtom } from "./atoms";
import {
  countPanes,
  findPane,
  findPaneByContent,
  findPaneByThread,
  removePane,
  replacePaneContent,
  setFocus,
  splitPane,
} from "./ops";
import { splitLayoutSchema } from "./persistence";
import type { PaneContent, SplitLayout } from "./types";

export const SPLIT_TABS_STORAGE_KEY = "bb.splitTabs";
const MAX_CLOSED_SPLIT_ITEMS = 20;
const FIRST_TAB_ID = "tab-1";

export interface SplitTab {
  id: string;
  layout: SplitLayout | null;
  projectId: string | null;
  name: string | null;
}

export interface SplitTabsState {
  tabs: SplitTab[];
  activeTabId: string;
}

export type ClosedSplitItem =
  | { kind: "pane"; content: PaneContent }
  | {
      kind: "tab";
      layout: SplitLayout | null;
      projectId: string | null;
      name: string | null;
    };

const INITIAL_SPLIT_TABS: SplitTabsState = {
  tabs: [{ id: FIRST_TAB_ID, layout: null, projectId: null, name: null }],
  activeTabId: FIRST_TAB_ID,
};

const splitTabsStateSchema = z
  .object({
    tabs: z
      .array(
        z
          .object({
            id: z.string().min(1),
            layout: splitLayoutSchema.nullable(),
            projectId: z.string().min(1).nullable().default(null),
            name: z.string().min(1).nullable().default(null),
          })
          .strict(),
      )
      .min(1),
    activeTabId: z.string().min(1),
  })
  .strict()
  .refine((state) => state.tabs.some((tab) => tab.id === state.activeTabId));

export function parseSplitTabsState(
  storedValue: string | null,
): SplitTabsState {
  if (storedValue === null || storedValue === "") return INITIAL_SPLIT_TABS;
  try {
    const result = splitTabsStateSchema.safeParse(JSON.parse(storedValue));
    return result.success ? result.data : INITIAL_SPLIT_TABS;
  } catch {
    return INITIAL_SPLIT_TABS;
  }
}

export const splitTabsAtom = atomWithStorage<SplitTabsState>(
  SPLIT_TABS_STORAGE_KEY,
  INITIAL_SPLIT_TABS,
  createTabScopedStorage<SplitTabsState>({
    parse: (storedValue) => parseSplitTabsState(storedValue),
    serialize: (value) => JSON.stringify(value),
  }),
  { getOnInit: true },
);

export const closedSplitItemsAtom = atom<ClosedSplitItem[]>([]);

const NEW_THREAD_LAYOUT: SplitLayout = {
  root: { type: "pane", paneId: "pane-1", content: { kind: "new-thread" } },
  focusedPaneId: "pane-1",
};

function nextTabId(tabs: readonly SplitTab[]): string {
  const used = new Set(tabs.map((tab) => tab.id));
  let id = `tab-${Date.now().toString(36)}`;
  while (used.has(id)) id = `${id}x`;
  return id;
}

function snapshotActiveTab(
  state: SplitTabsState,
  activeLayout: SplitLayout | null,
): SplitTab[] {
  return state.tabs.map((tab) =>
    tab.id === state.activeTabId ? { ...tab, layout: activeLayout } : tab,
  );
}

export function insertSplitTab(
  state: SplitTabsState,
  activeLayout: SplitLayout | null,
  layout: SplitLayout | null,
  projectId: string | null,
  name: string | null = null,
): SplitTabsState | null {
  const tabs = snapshotActiveTab(state, activeLayout);
  const id = nextTabId(tabs);
  const activeIndex = tabs.findIndex((tab) => tab.id === state.activeTabId);
  tabs.splice(activeIndex + 1, 0, { id, layout, projectId, name });
  return { tabs, activeTabId: id };
}

export function selectSplitTab(
  state: SplitTabsState,
  activeLayout: SplitLayout | null,
  tabId: string,
): SplitTabsState | null {
  if (tabId === state.activeTabId) return null;
  if (!state.tabs.some((tab) => tab.id === tabId)) return null;
  return {
    tabs: snapshotActiveTab(state, activeLayout),
    activeTabId: tabId,
  };
}

export function removeSplitTab(
  state: SplitTabsState,
  activeLayout: SplitLayout | null,
  tabId: string,
): { state: SplitTabsState; closed: SplitTab } | null {
  if (state.tabs.length < 2) return null;
  const tabs = snapshotActiveTab(state, activeLayout);
  const index = tabs.findIndex((tab) => tab.id === tabId);
  const closed = tabs[index];
  if (closed === undefined) return null;
  tabs.splice(index, 1);
  const activeTabId =
    tabId === state.activeTabId
      ? (tabs[Math.min(index, tabs.length - 1)]?.id ?? tabs[0]!.id)
      : state.activeTabId;
  return { state: { tabs, activeTabId }, closed };
}

function layoutOfTab(state: SplitTabsState, tabId: string) {
  return state.tabs.find((tab) => tab.id === tabId)?.layout ?? null;
}

function routeLayoutFor(layout: SplitLayout | null): SplitLayout {
  return layout ?? NEW_THREAD_LAYOUT;
}

function pushClosed(
  items: readonly ClosedSplitItem[],
  item: ClosedSplitItem,
): ClosedSplitItem[] {
  return [...items, item].slice(-MAX_CLOSED_SPLIT_ITEMS);
}

function activateTabLayout(
  set: Setter,
  state: SplitTabsState,
  layout: SplitLayout,
): SplitLayout {
  set(splitTabsAtom, state);
  set(splitLayoutAtom, layout);
  set(maximizedPaneIdAtom, null);
  const projectId = state.tabs.find(
    (tab) => tab.id === state.activeTabId,
  )?.projectId;
  if (projectId !== undefined && projectId !== null) {
    set(rootComposeProjectIdAtom, projectId);
  }
  return layout;
}

export const openSplitTabAtom = atom(
  null,
  (get, set, projectId: string | null = null): SplitLayout | null => {
    const next = insertSplitTab(
      get(splitTabsAtom),
      get(splitLayoutAtom),
      NEW_THREAD_LAYOUT,
      projectId,
    );
    return next === null
      ? null
      : activateTabLayout(set, next, NEW_THREAD_LAYOUT);
  },
);

interface ThreadRef {
  projectId: string;
  threadId: string;
}

function singlePaneLayout(content: PaneContent): SplitLayout {
  return {
    root: { type: "pane", paneId: "pane-1", content },
    focusedPaneId: "pane-1",
  };
}

function findThreadTab(
  tabs: readonly SplitTab[],
  thread: ThreadRef,
): { tabId: string; layout: SplitLayout } | null {
  for (const tab of tabs) {
    if (tab.layout === null) continue;
    const pane = findPaneByThread(
      tab.layout.root,
      thread.projectId,
      thread.threadId,
    );
    if (pane !== null) {
      return { tabId: tab.id, layout: setFocus(tab.layout, pane.paneId) };
    }
  }
  return null;
}

export const openThreadInTabAtom = atom(
  null,
  (get, set, thread: ThreadRef): SplitLayout | null => {
    const state = get(splitTabsAtom);
    const activeLayout = get(splitLayoutAtom);
    const tabs = snapshotActiveTab(state, activeLayout);
    const found = findThreadTab(tabs, thread);
    if (found !== null) {
      return activateTabLayout(
        set,
        { tabs, activeTabId: found.tabId },
        found.layout,
      );
    }
    const layout = singlePaneLayout({ kind: "thread", ...thread });
    const next = insertSplitTab(state, activeLayout, layout, thread.projectId);
    return next === null ? null : activateTabLayout(set, next, layout);
  },
);

export const focusThreadInOtherTabAtom = atom(
  null,
  (get, set, thread: ThreadRef): boolean => {
    const state = get(splitTabsAtom);
    const activeLayout = get(splitLayoutAtom);
    if (
      activeLayout !== null &&
      findPaneByThread(activeLayout.root, thread.projectId, thread.threadId) !==
        null
    ) {
      return false;
    }
    const tabs = snapshotActiveTab(state, activeLayout);
    const found = findThreadTab(tabs, thread);
    if (found === null) return false;
    activateTabLayout(set, { tabs, activeTabId: found.tabId }, found.layout);
    return true;
  },
);

function placeInLayout(
  layout: SplitLayout | null,
  content: PaneContent,
): SplitLayout | null {
  if (layout === null) return singlePaneLayout(content);
  const focused = findPane(layout.root, layout.focusedPaneId);
  if (focused?.content.kind === "new-thread") {
    return replacePaneContent(layout, layout.focusedPaneId, content);
  }
  const next = splitPane(layout, layout.focusedPaneId, "right", content);
  return next === layout ? null : next;
}

export const movePaneToTabAtom = atom(
  null,
  (
    get,
    set,
    move: { paneId: string; tabId: string | null },
  ): SplitLayout | null => {
    const state = get(splitTabsAtom);
    const activeLayout = get(splitLayoutAtom);
    if (activeLayout === null || move.tabId === state.activeTabId) return null;
    const pane = findPane(activeLayout.root, move.paneId);
    if (pane === null || pane.content.kind === "new-thread") return null;
    const isLastPane = countPanes(activeLayout.root) === 1;
    if (isLastPane && move.tabId === null) return null;
    const target =
      move.tabId === null
        ? null
        : state.tabs.find((tab) => tab.id === move.tabId);
    if (target === undefined) return null;
    const layout = placeInLayout(target?.layout ?? null, pane.content);
    if (layout === null) return null;
    const projectId =
      pane.content.kind === "thread" ? pane.content.projectId : null;
    const remaining = isLastPane
      ? state.tabs.filter((tab) => tab.id !== state.activeTabId)
      : snapshotActiveTab(state, removePane(activeLayout, move.paneId));
    if (target === null) {
      const next = insertSplitTab(
        { tabs: remaining, activeTabId: state.activeTabId },
        removePane(activeLayout, move.paneId),
        layout,
        projectId,
      );
      return next === null ? null : activateTabLayout(set, next, layout);
    }
    const tabs = remaining.map((tab) =>
      tab.id === target.id ? { ...tab, layout } : tab,
    );
    return activateTabLayout(set, { tabs, activeTabId: target.id }, layout);
  },
);

export function renameSplitTab(
  state: SplitTabsState,
  tabId: string,
  name: string,
): SplitTabsState {
  const trimmed = name.trim();
  return {
    ...state,
    tabs: state.tabs.map((tab) =>
      tab.id === tabId
        ? { ...tab, name: trimmed === "" ? null : trimmed }
        : tab,
    ),
  };
}

export const renameSplitTabAtom = atom(
  null,
  (get, set, rename: { tabId: string; name: string }) => {
    set(
      splitTabsAtom,
      renameSplitTab(get(splitTabsAtom), rename.tabId, rename.name),
    );
  },
);

export const selectSplitTabAtom = atom(
  null,
  (get, set, tabId: string): SplitLayout | null => {
    const state = get(splitTabsAtom);
    if (tabId === state.activeTabId) {
      return routeLayoutFor(get(splitLayoutAtom));
    }
    const next = selectSplitTab(state, get(splitLayoutAtom), tabId);
    if (next === null) return null;
    return activateTabLayout(
      set,
      next,
      routeLayoutFor(layoutOfTab(next, tabId)),
    );
  },
);

export const closeSplitTabAtom = atom(
  null,
  (get, set, tabId: string): SplitLayout | null => {
    const current = get(splitTabsAtom);
    const result = removeSplitTab(current, get(splitLayoutAtom), tabId);
    if (result === null) return null;
    set(splitTabsAtom, result.state);
    set(
      closedSplitItemsAtom,
      pushClosed(get(closedSplitItemsAtom), {
        kind: "tab",
        layout: result.closed.layout,
        projectId: result.closed.projectId,
        name: result.closed.name,
      }),
    );
    if (tabId !== current.activeTabId) return null;
    return activateTabLayout(
      set,
      result.state,
      routeLayoutFor(layoutOfTab(result.state, result.state.activeTabId)),
    );
  },
);

export const recordClosedPaneAtom = atom(
  null,
  (get, set, content: PaneContent) => {
    if (content.kind === "new-thread") return;
    set(
      closedSplitItemsAtom,
      pushClosed(get(closedSplitItemsAtom), { kind: "pane", content }),
    );
  },
);

export const reopenClosedSplitItemAtom = atom(
  null,
  (get, set): SplitLayout | null => {
    const items = get(closedSplitItemsAtom);
    const item = items.at(-1);
    if (item === undefined) return null;
    const activeLayout = get(splitLayoutAtom);
    if (item.kind === "tab") {
      const layout = routeLayoutFor(item.layout);
      const next = insertSplitTab(
        get(splitTabsAtom),
        activeLayout,
        layout,
        item.projectId,
        item.name,
      );
      if (next === null) return null;
      set(closedSplitItemsAtom, items.slice(0, -1));
      return activateTabLayout(set, next, layout);
    }
    const base = routeLayoutFor(activeLayout);
    const alreadyOpen = findPaneByContent(base.root, item.content);
    if (alreadyOpen !== null) {
      set(closedSplitItemsAtom, items.slice(0, -1));
      const focusedLayout = setFocus(base, alreadyOpen.paneId);
      set(splitLayoutAtom, focusedLayout);
      return focusedLayout;
    }
    const focused = findPane(base.root, base.focusedPaneId);
    const layout =
      focused?.content.kind === "new-thread"
        ? replacePaneContent(base, base.focusedPaneId, item.content)
        : splitPane(base, base.focusedPaneId, "right", item.content);
    if (layout === base) return null;
    set(closedSplitItemsAtom, items.slice(0, -1));
    set(splitLayoutAtom, layout);
    return layout;
  },
);
