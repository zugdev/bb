import { createStore } from "jotai";
import { PERSONAL_PROJECT_ID } from "@bb/domain";
import { describe, expect, it, vi } from "vitest";
import { splitLayoutAtom } from "./atoms";
import { findPane, listPanes, splitPane } from "./ops";
import { rootComposeProjectIdAtom } from "@/lib/root-compose-selection";
import {
  activeTabAcceptsContent,
  bindActiveTabProjectAtom,
  closeSplitTabAtom,
  focusThreadInOtherTabAtom,
  movePaneAcrossTabsAtom,
  movePaneToTabAtom,
  moveSplitTabAtom,
  openInboxTabAtom,
  openOutsideInboxTabAtom,
  openSplitTabAtom,
  openThreadInTab,
  openThreadInTabAtom,
  parseSplitTabsState,
  recordClosedPaneAtom,
  renameSplitTabAtom,
  reopenClosedSplitItemAtom,
  seedSplitComposeProjectAtom,
  selectSplitTabAtom,
  splitTabsAtom,
  tabProjectId,
} from "./tabs";
import type { SplitLayout } from "./types";

function threadLayout(threadId: string): SplitLayout {
  return {
    root: {
      type: "pane",
      paneId: "pane-1",
      content: { kind: "thread", projectId: "p1", threadId },
    },
    focusedPaneId: "pane-1",
  };
}

describe("split tabs", () => {
  it("keeps each tab's layout across switching, closing and reopening", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));

    const opened = store.set(openSplitTabAtom);
    expect(listPanes(opened!.root)[0]?.content).toEqual({ kind: "new-thread" });
    store.set(splitLayoutAtom, threadLayout("b"));
    const [first, second] = store.get(splitTabsAtom).tabs;

    expect(store.set(selectSplitTabAtom, first!.id)).toEqual(threadLayout("a"));
    expect(store.get(splitLayoutAtom)).toEqual(threadLayout("a"));
    expect(store.set(selectSplitTabAtom, second!.id)).toEqual(
      threadLayout("b"),
    );

    expect(store.set(closeSplitTabAtom, second!.id)).toEqual(threadLayout("a"));
    expect(store.get(splitTabsAtom).tabs).toHaveLength(1);
    expect(
      listPanes(store.set(closeSplitTabAtom, first!.id)!.root)[0]?.content,
    ).toEqual({ kind: "new-thread" });
    expect(store.get(splitTabsAtom).tabs).toHaveLength(1);
    expect(store.get(splitTabsAtom).tabs[0]?.id).not.toBe(first!.id);

    expect(store.set(reopenClosedSplitItemAtom)).toEqual(threadLayout("a"));
    expect(store.set(reopenClosedSplitItemAtom)).toEqual(threadLayout("b"));
    expect(store.get(splitTabsAtom).tabs).toHaveLength(3);
  });

  it("reopens a closed pane beside the focused pane and skips empty composers", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    store.set(recordClosedPaneAtom, { kind: "new-thread" });
    store.set(recordClosedPaneAtom, {
      kind: "thread",
      projectId: "p1",
      threadId: "b",
    });

    const reopened = store.set(reopenClosedSplitItemAtom);
    expect(listPanes(reopened!.root).map((pane) => pane.content)).toEqual([
      { kind: "thread", projectId: "p1", threadId: "a" },
      { kind: "thread", projectId: "p1", threadId: "b" },
    ]);
    expect(store.set(reopenClosedSplitItemAtom)).toBeNull();
  });

  it("opens threads picked outside Inbox in their own tab and leaves the Inbox tab alone", () => {
    const store = createStore();
    const other = { kind: "thread", projectId: "p1", threadId: "b" } as const;
    expect(store.set(openOutsideInboxTabAtom, other)).toBe(false);

    store.set(splitLayoutAtom, threadLayout("a"));
    store.set(openInboxTabAtom);
    store.set(splitLayoutAtom, threadLayout("a"));
    const focusTabId = store.get(splitTabsAtom).activeTabId;
    expect(
      store.set(openOutsideInboxTabAtom, {
        kind: "thread",
        projectId: "p1",
        threadId: "a",
      }),
    ).toBe(false);

    expect(store.set(openOutsideInboxTabAtom, other)).toBe(true);
    const { tabs, activeTabId } = store.get(splitTabsAtom);
    expect(activeTabId).not.toBe(focusTabId);
    expect(listPanes(store.get(splitLayoutAtom)!.root)[0]?.content).toEqual(
      other,
    );
    expect(tabs.find((tab) => tab.id === focusTabId)?.layout).toEqual(
      threadLayout("a"),
    );
  });

  it("opens a thread in its own tab once and preselects a tab's project", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    const thread = { projectId: "p1", threadId: "b" };

    store.set(openThreadInTabAtom, thread);
    const afterOpen = store.get(splitTabsAtom);
    expect(afterOpen.tabs.map((tab) => tab.projectId)).toEqual(["p1", "p1"]);
    store.set(selectSplitTabAtom, afterOpen.tabs[0]!.id);
    store.set(openThreadInTabAtom, thread);
    expect(store.get(splitTabsAtom).tabs).toHaveLength(2);
    expect(store.get(splitTabsAtom).activeTabId).toBe(afterOpen.activeTabId);

    store.set(openSplitTabAtom, "p2");
    expect(store.get(rootComposeProjectIdAtom)).toBe("p2");

    store.set(openSplitTabAtom);
    expect(store.get(rootComposeProjectIdAtom)).toBe(PERSONAL_PROJECT_ID);
  });

  it("starts a new tab in No project after a split took the split pane's project", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));

    store.set(seedSplitComposeProjectAtom, {
      kind: "thread",
      projectId: "p1",
      threadId: "a",
    });
    expect(store.get(rootComposeProjectIdAtom)).toBe("p1");

    store.set(seedSplitComposeProjectAtom, { kind: "new-thread" });
    expect(store.get(rootComposeProjectIdAtom)).toBe("p1");

    store.set(openSplitTabAtom);
    expect(store.get(rootComposeProjectIdAtom)).toBe(PERSONAL_PROJECT_ID);

    store.set(rootComposeProjectIdAtom, "p2");
    store.set(seedSplitComposeProjectAtom, {
      kind: "plugin-detail",
      pluginId: "x",
    });
    expect(store.get(rootComposeProjectIdAtom)).toBe(PERSONAL_PROJECT_ID);
  });

  it("routes to the thread it focuses when opening a tab", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    const navigate = vi.fn();

    openThreadInTab(store, navigate, { projectId: "p1", threadId: "b" });

    const layout = store.get(splitLayoutAtom)!;
    expect(findPane(layout.root, layout.focusedPaneId)?.content).toEqual({
      kind: "thread",
      projectId: "p1",
      threadId: "b",
    });
    expect(store.get(splitTabsAtom).tabs).toHaveLength(2);
    expect(navigate).toHaveBeenCalledWith("/projects/p1/threads/b", {
      replace: true,
    });
  });

  it("opens another new thread tab while one is already empty", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    store.set(openSplitTabAtom);
    const empty = store.get(splitTabsAtom).activeTabId;

    store.set(openSplitTabAtom, "p2");
    const state = store.get(splitTabsAtom);
    expect(state.tabs).toHaveLength(3);
    expect(new Set(state.tabs.map((tab) => tab.id)).size).toBe(3);
    expect(state.activeTabId).not.toBe(empty);
    expect(store.get(rootComposeProjectIdAtom)).toBe("p2");

    store.set(openThreadInTabAtom, { projectId: "p1", threadId: "b" });
    const tabs = store.get(splitTabsAtom).tabs;
    expect(tabs).toHaveLength(4);
    expect(tabs.find((tab) => tab.id === empty)?.layout).toMatchObject({
      root: { content: { kind: "new-thread" } },
    });
  });

  it("switches to the tab that already shows a routed thread", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    const first = store.get(splitTabsAtom).activeTabId;
    store.set(openThreadInTabAtom, { projectId: "p1", threadId: "b" });

    expect(
      store.set(focusThreadInOtherTabAtom, { projectId: "p1", threadId: "b" }),
    ).toBe(false);
    expect(
      store.set(focusThreadInOtherTabAtom, { projectId: "p1", threadId: "c" }),
    ).toBe(false);
    expect(
      store.set(focusThreadInOtherTabAtom, { projectId: "p1", threadId: "a" }),
    ).toBe(true);
    expect(store.get(splitTabsAtom).activeTabId).toBe(first);
    expect(store.get(splitLayoutAtom)).toEqual(threadLayout("a"));
  });

  it("moves a pane into another tab and closes a tab left empty", () => {
    const store = createStore();
    store.set(
      splitLayoutAtom,
      splitPane(threadLayout("a"), "pane-1", "right", {
        kind: "thread",
        projectId: "p1",
        threadId: "b",
      }),
    );
    const first = store.get(splitTabsAtom).activeTabId;
    store.set(openThreadInTabAtom, { projectId: "p1", threadId: "c" });
    const second = store.get(splitTabsAtom).activeTabId;
    store.set(selectSplitTabAtom, first);

    const moved = store.set(movePaneToTabAtom, {
      paneId: "pane-2",
      tabId: second,
    });
    const threadsOf = (layout: SplitLayout | null | undefined) =>
      layout == null
        ? []
        : listPanes(layout.root).map((pane) =>
            pane.content.kind === "thread" ? pane.content.threadId : null,
          );
    expect(threadsOf(moved)).toEqual(["c", "b"]);
    expect(store.get(splitTabsAtom).activeTabId).toBe(second);
    expect(
      threadsOf(
        store.get(splitTabsAtom).tabs.find((t) => t.id === first)?.layout,
      ),
    ).toEqual(["a"]);

    store.set(selectSplitTabAtom, first);
    store.set(movePaneToTabAtom, { paneId: "pane-1", tabId: second });
    const state = store.get(splitTabsAtom);
    expect(state.tabs.map((tab) => tab.id)).toEqual([second]);
    expect(threadsOf(store.get(splitLayoutAtom))).toEqual(["c", "b", "a"]);
  });

  it("moves a pane out to a new tab", () => {
    const store = createStore();
    store.set(
      splitLayoutAtom,
      splitPane(threadLayout("a"), "pane-1", "right", {
        kind: "thread",
        projectId: "p1",
        threadId: "b",
      }),
    );
    const moved = store.set(movePaneToTabAtom, {
      paneId: "pane-2",
      tabId: null,
    });
    expect(moved).toEqual(threadLayout("b"));
    expect(store.get(splitTabsAtom).tabs).toHaveLength(2);
    expect(store.get(splitTabsAtom).tabs[0]?.layout).toEqual(threadLayout("a"));
    expect(
      store.set(movePaneToTabAtom, { paneId: "pane-1", tabId: null }),
    ).toBeNull();
  });

  it("reorders tabs and ignores a move to the same place", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    store.set(openThreadInTabAtom, { projectId: "p1", threadId: "b" });
    store.set(openThreadInTabAtom, { projectId: "p1", threadId: "c" });
    const [first, second, third] = store
      .get(splitTabsAtom)
      .tabs.map((tab) => tab.id);

    store.set(moveSplitTabAtom, { tabId: third!, toIndex: 0 });
    expect(store.get(splitTabsAtom).tabs.map((tab) => tab.id)).toEqual([
      third,
      first,
      second,
    ]);
    store.set(moveSplitTabAtom, { tabId: second!, toIndex: 9 });
    expect(store.get(splitTabsAtom).tabs.map((tab) => tab.id)).toEqual([
      third,
      first,
      second,
    ]);
    expect(store.get(splitTabsAtom).activeTabId).toBe(third);
  });

  it("drops a pane from another tab into a split of the active tab", () => {
    const store = createStore();
    store.set(
      splitLayoutAtom,
      splitPane(threadLayout("a"), "pane-1", "right", {
        kind: "thread",
        projectId: "p1",
        threadId: "b",
      }),
    );
    const source = store.get(splitTabsAtom).activeTabId;
    store.set(openThreadInTabAtom, { projectId: "p1", threadId: "c" });
    const target = store.get(splitTabsAtom).activeTabId;
    const threadsOf = (layout: SplitLayout | null | undefined) =>
      layout == null
        ? []
        : listPanes(layout.root).map((pane) =>
            pane.content.kind === "thread" ? pane.content.threadId : null,
          );

    const moved = store.set(movePaneAcrossTabsAtom, {
      sourceTabId: source,
      paneId: "pane-2",
      targetPaneId: "pane-1",
      zone: "left",
    });
    expect(threadsOf(moved)).toEqual(["b", "c"]);
    expect(
      threadsOf(
        store.get(splitTabsAtom).tabs.find((tab) => tab.id === source)?.layout,
      ),
    ).toEqual(["a"]);
    expect(
      store.set(movePaneAcrossTabsAtom, {
        sourceTabId: source,
        paneId: "pane-1",
        targetPaneId: "pane-1",
        zone: "center",
      }),
    ).toBeNull();

    store.set(movePaneAcrossTabsAtom, {
      sourceTabId: source,
      paneId: "pane-1",
      targetPaneId: "pane-1",
      zone: "bottom",
    });
    expect(store.get(splitTabsAtom).tabs.map((tab) => tab.id)).toEqual([
      target,
    ]);
    expect(threadsOf(store.get(splitLayoutAtom))).toHaveLength(3);
  });

  it("falls back to one tab when the stored state is invalid", () => {
    expect(
      parseSplitTabsState(
        JSON.stringify({
          tabs: [{ id: "tab-1", layout: null }],
          activeTabId: "x",
        }),
      ).tabs,
    ).toEqual([{ id: "tab-1", layout: null, projectId: null, name: null }]);
  });

  it("keeps a closed tab's name when it is reopened", () => {
    const store = createStore();
    store.set(openSplitTabAtom);
    const tabId = store.get(splitTabsAtom).activeTabId;
    store.set(renameSplitTabAtom, { tabId, name: "Backend" });
    store.set(closeSplitTabAtom, tabId);
    store.set(reopenClosedSplitItemAtom);
    const state = store.get(splitTabsAtom);
    expect(state.tabs.find((tab) => tab.id === state.activeTabId)?.name).toBe(
      "Backend",
    );
  });

  it("renames a tab and clears the name when it is blank", () => {
    const store = createStore();
    const tabId = store.get(splitTabsAtom).activeTabId;
    store.set(renameSplitTabAtom, { tabId, name: "  Backend  " });
    expect(store.get(splitTabsAtom).tabs[0]?.name).toBe("Backend");
    store.set(renameSplitTabAtom, { tabId, name: "   " });
    expect(store.get(splitTabsAtom).tabs[0]?.name).toBeNull();
  });

  it("keeps a tab's project and name through a reload", () => {
    const store = createStore();
    store.set(openSplitTabAtom, "p2");
    const state = store.get(splitTabsAtom);
    store.set(renameSplitTabAtom, { tabId: state.activeTabId, name: "API" });
    expect(
      parseSplitTabsState(JSON.stringify(store.get(splitTabsAtom))).tabs.map(
        (tab) => [tab.projectId, tab.name],
      ),
    ).toEqual([
      [null, null],
      ["p2", "API"],
    ]);
  });
});

describe("project bound tabs", () => {
  const p2Thread = { kind: "thread", projectId: "p2", threadId: "x" } as const;

  it("binds a tab to the project of its first thread and keeps it after the thread closes", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    store.set(openSplitTabAtom);
    const [first] = store.get(splitTabsAtom).tabs;
    expect(tabProjectId(first!)).toBe("p1");

    store.set(bindActiveTabProjectAtom, "p2");
    store.set(bindActiveTabProjectAtom, "p1");
    expect(store.get(splitTabsAtom).tabs[1]?.projectId).toBe("p2");
  });

  it("refuses panes from another project in moves between tabs", () => {
    const store = createStore();
    store.set(
      splitLayoutAtom,
      splitPane(threadLayout("a"), "pane-1", "right", p2Thread),
    );
    const source = store.get(splitTabsAtom).activeTabId;
    store.set(openThreadInTabAtom, { projectId: "p1", threadId: "c" });
    const target = store.get(splitTabsAtom).activeTabId;

    expect(
      store.set(movePaneAcrossTabsAtom, {
        sourceTabId: source,
        paneId: "pane-2",
        targetPaneId: "pane-1",
        zone: "left",
      }),
    ).toBeNull();
    store.set(selectSplitTabAtom, source);
    expect(
      store.set(movePaneToTabAtom, { paneId: "pane-2", tabId: target }),
    ).toBeNull();
    expect(activeTabAcceptsContent(store, p2Thread)).toBe(false);
    expect(
      activeTabAcceptsContent(store, { ...p2Thread, projectId: "p1" }),
    ).toBe(true);
  });
});
