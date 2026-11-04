import { createStore } from "jotai";
import { describe, expect, it } from "vitest";
import { splitLayoutAtom } from "./atoms";
import { listPanes, splitPane } from "./ops";
import { rootComposeProjectIdAtom } from "@/lib/root-compose-selection";
import {
  closeSplitTabAtom,
  focusThreadInOtherTabAtom,
  movePaneToTabAtom,
  openSplitTabAtom,
  openThreadInTabAtom,
  parseSplitTabsState,
  recordClosedPaneAtom,
  renameSplitTabAtom,
  reopenClosedSplitItemAtom,
  selectSplitTabAtom,
  splitTabsAtom,
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
    expect(store.set(closeSplitTabAtom, first!.id)).toBeNull();

    expect(store.set(reopenClosedSplitItemAtom)).toEqual(threadLayout("b"));
    expect(store.get(splitTabsAtom).tabs).toHaveLength(2);
    expect(store.set(reopenClosedSplitItemAtom)).toBeNull();
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

  it("opens a thread in its own tab once and preselects a tab's project", () => {
    const store = createStore();
    store.set(splitLayoutAtom, threadLayout("a"));
    const thread = { projectId: "p1", threadId: "b" };

    store.set(openThreadInTabAtom, thread);
    const afterOpen = store.get(splitTabsAtom);
    expect(afterOpen.tabs.map((tab) => tab.projectId)).toEqual([null, "p1"]);
    store.set(selectSplitTabAtom, afterOpen.tabs[0]!.id);
    store.set(openThreadInTabAtom, thread);
    expect(store.get(splitTabsAtom).tabs).toHaveLength(2);
    expect(store.get(splitTabsAtom).activeTabId).toBe(afterOpen.activeTabId);

    store.set(openSplitTabAtom, "p2");
    expect(store.get(rootComposeProjectIdAtom)).toBe("p2");
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
