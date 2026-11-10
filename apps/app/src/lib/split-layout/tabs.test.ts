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
  closeThreadsInAllTabsAtom,
  focusThreadInOtherTabAtom,
  movePaneAcrossTabsAtom,
  movePaneToTabAtom,
  moveSplitTabAtom,
  landOwnedPanelRedirectAtom,
  openOutsideOwnedTabAtom,
  openOwnedTabAtom,
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

const INBOX = {
  owner: { kind: "inbox" },
  content: { kind: "new-thread" },
} as const;

const ASSISTANT_PANEL = {
  kind: "plugin-panel",
  pluginId: "assistant",
  panelPath: "assistant",
  subPath: "",
} as const;

const ASSISTANT = {
  owner: {
    kind: "panel",
    panel: { pluginId: "assistant", panelPath: "assistant" },
  },
  content: ASSISTANT_PANEL,
} as const;

describe("owned tabs", () => {
  it("keeps one Inbox tab and one tab per panel, focusing the existing one", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));

    store.set(openOwnedTabAtom, INBOX);
    const inboxTabId = store.get(splitTabsAtom).activeTabId;
    store.set(openOwnedTabAtom, ASSISTANT);
    const assistantTabId = store.get(splitTabsAtom).activeTabId;
    expect(store.get(splitLayoutAtom)).toEqual({
      root: { type: "pane", paneId: "pane-1", content: ASSISTANT_PANEL },
      focusedPaneId: "pane-1",
    });

    store.set(openOwnedTabAtom, INBOX);
    expect(store.get(splitTabsAtom).activeTabId).toBe(inboxTabId);
    store.set(openOwnedTabAtom, ASSISTANT);
    expect(store.get(splitTabsAtom).activeTabId).toBe(assistantTabId);
    expect(store.get(splitTabsAtom).tabs).toHaveLength(3);
  });

  it("keeps the thread a panel tab redirects to and closes other tabs showing only it", () => {
    const store = createStore();
    const assistantThread = { projectId: "p1", threadId: "assistant" };
    store.set(splitLayoutAtom, threadLayout("assistant"));
    const legacyTabId = store.get(splitTabsAtom).activeTabId;
    store.set(openOwnedTabAtom, ASSISTANT);

    expect(store.set(landOwnedPanelRedirectAtom, assistantThread)).toBe(true);
    expect(store.get(splitTabsAtom).tabs.map((tab) => tab.id)).not.toContain(
      legacyTabId,
    );
    store.set(splitLayoutAtom, threadLayout("assistant"));
    expect(store.set(landOwnedPanelRedirectAtom, assistantThread)).toBe(false);
    expect(
      store.set(openOutsideOwnedTabAtom, {
        kind: "thread",
        projectId: "p1",
        threadId: "b",
      }),
    ).toBe(true);
    const [assistantTab] = store.get(splitTabsAtom).tabs;
    expect(tabProjectId(assistantTab!)).toBeNull();
  });

  it("focuses the existing owned tab when a closed one is reopened", () => {
    const store = createStore();
    store.set(openOwnedTabAtom, INBOX);
    const firstInboxId = store.get(splitTabsAtom).activeTabId;
    store.set(openSplitTabAtom);
    store.set(closeSplitTabAtom, firstInboxId);
    store.set(openOwnedTabAtom, INBOX);
    const inboxTabId = store.get(splitTabsAtom).activeTabId;
    store.set(openSplitTabAtom);

    store.set(reopenClosedSplitItemAtom);
    const { tabs, activeTabId } = store.get(splitTabsAtom);
    expect(activeTabId).toBe(inboxTabId);
    expect(tabs.filter((tab) => tab.kind === "inbox")).toHaveLength(1);
  });

  it("collapses duplicate owned tabs from stored state", () => {
    const panel = { pluginId: "assistant", panelPath: "assistant" };
    const parsed = parseSplitTabsState(
      JSON.stringify({
        tabs: [
          { id: "inbox", layout: null, kind: "inbox" },
          { id: "focus", layout: null, kind: "focus" },
          { id: "assistant", layout: null, panel },
          { id: "assistant-2", layout: null, panel },
          { id: "plain", layout: null },
        ],
        activeTabId: "assistant-2",
      }),
    );
    expect(parsed.tabs.map((tab) => tab.id)).toEqual([
      "inbox",
      "assistant",
      "plain",
    ]);
    expect(parsed.activeTabId).toBe("assistant");
  });
});

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
    expect(store.set(openOutsideOwnedTabAtom, other)).toBe(false);

    store.set(splitLayoutAtom, threadLayout("a"));
    store.set(openOwnedTabAtom, INBOX);
    store.set(splitLayoutAtom, threadLayout("a"));
    const focusTabId = store.get(splitTabsAtom).activeTabId;
    expect(
      store.set(openOutsideOwnedTabAtom, {
        kind: "thread",
        projectId: "p1",
        threadId: "a",
      }),
    ).toBe(false);

    expect(store.set(openOutsideOwnedTabAtom, other)).toBe(true);
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

describe("closing threads in all tabs", () => {
  function threadIdsByTab(store: ReturnType<typeof createStore>) {
    const { tabs, activeTabId } = store.get(splitTabsAtom);
    return tabs.map((tab) =>
      listPanes(
        (tab.id === activeTabId ? store.get(splitLayoutAtom) : tab.layout)!
          .root,
      ).map((pane) =>
        pane.content.kind === "thread" ? pane.content.threadId : "",
      ),
    );
  }

  it("removes the thread's panes from background tabs and drops tabs it leaves empty", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("archived"));
    store.set(openSplitTabAtom);
    store.set(
      splitLayoutAtom,
      splitPane(threadLayout("archived"), "pane-1", "right", {
        kind: "thread",
        projectId: "p1",
        threadId: "kept",
      }),
    );
    store.set(openSplitTabAtom);
    store.set(splitLayoutAtom, threadLayout("other"));

    const result = store.set(closeThreadsInAllTabsAtom, ["archived"]);

    expect(result.removedAny).toBe(false);
    expect(threadIdsByTab(store)).toEqual([["kept"], ["other"]]);
  });

  it("closes the active tab when the thread was its only pane and focuses the next tab", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("kept"));
    store.set(openSplitTabAtom);
    store.set(splitLayoutAtom, threadLayout("archived"));

    const result = store.set(closeThreadsInAllTabsAtom, ["archived"]);

    expect(result).toEqual({
      removedAny: true,
      focusedRoute: { projectId: "p1", threadId: "kept" },
    });
    expect(threadIdsByTab(store)).toEqual([["kept"]]);
  });
});
