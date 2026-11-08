import { createStore } from "jotai";
import { describe, expect, it, vi } from "vitest";
import { splitLayoutAtom } from "./atoms";
import { openThreadInSplit } from "./openThreadInSplit";
import { countPanes, findPaneByThread, type SplitLayout } from "./index";

function layout(threadId = "thread-1"): SplitLayout {
  return {
    root: {
      type: "pane",
      paneId: "pane-1",
      content: { kind: "thread", projectId: "project-1", threadId },
    },
    focusedPaneId: "pane-1",
  };
}

function eightPanes(): SplitLayout {
  return {
    root: {
      type: "split",
      dir: "row",
      sizes: Array.from({ length: 8 }, () => 0.125),
      children: Array.from({ length: 8 }, (_, index) => ({
        type: "pane" as const,
        paneId: `pane-${index + 1}`,
        content: {
          kind: "thread" as const,
          projectId: "project-1",
          threadId: `thread-${index + 1}`,
        },
      })),
    },
    focusedPaneId: "pane-1",
  };
}

function storeWith(initial: SplitLayout) {
  const store = createStore();
  store.set(splitLayoutAtom, initial);
  return store;
}

function currentLayout(store: ReturnType<typeof createStore>): SplitLayout {
  const current = store.get(splitLayoutAtom);
  if (current === null) throw new Error("expected a split layout");
  return current;
}

describe("openThreadInSplit", () => {
  it("preserves search deep-link state when creating a split", () => {
    const store = storeWith(layout());
    const navigate = vi.fn();
    openThreadInSplit({
      store,
      navigate,
      projectId: "project-1",
      threadId: "thread-2",
      isCompact: false,
      state: { searchMessageSeq: 42, searchThreadId: "thread-2" },
    });

    expect(currentLayout(store).root.type).toBe("split");
    expect(navigate).toHaveBeenCalledWith(
      "/projects/project-1/threads/thread-2",
      {
        state: { searchMessageSeq: 42, searchThreadId: "thread-2" },
      },
    );
  });

  it("keeps replace semantics and state when the result is already open", () => {
    const store = storeWith(layout("thread-2"));
    const navigate = vi.fn();
    openThreadInSplit({
      store,
      navigate,
      projectId: "project-1",
      threadId: "thread-2",
      isCompact: false,
      state: { searchMessageSeq: 7, searchThreadId: "thread-2" },
    });

    expect(navigate).toHaveBeenCalledWith(
      "/projects/project-1/threads/thread-2",
      {
        replace: true,
        state: { searchMessageSeq: 7, searchThreadId: "thread-2" },
      },
    );
  });

  it("coerces to a replace of the focused pane at the eight-pane cap", () => {
    const store = storeWith(eightPanes());
    const navigate = vi.fn();
    openThreadInSplit({
      store,
      navigate,
      projectId: "project-1",
      threadId: "thread-9",
      isCompact: false,
    });

    const current = currentLayout(store);
    expect(countPanes(current.root)).toBe(8);
    expect(
      findPaneByThread(current.root, "project-1", "thread-9")?.paneId,
    ).toBe("pane-1");
    expect(findPaneByThread(current.root, "project-1", "thread-1")).toBeNull();
    expect(navigate).toHaveBeenCalledWith(
      "/projects/project-1/threads/thread-9",
      undefined,
    );
  });

  it("plain-navigates without touching the layout on compact viewports or for another project's thread", () => {
    for (const [projectId, isCompact] of [
      ["project-1", true],
      ["project-2", false],
    ] as const) {
      const store = storeWith(layout());
      const navigate = vi.fn();
      openThreadInSplit({
        store,
        navigate,
        projectId,
        threadId: "thread-9",
        isCompact,
      });

      expect(store.get(splitLayoutAtom)).toEqual(layout());
      expect(navigate).toHaveBeenCalledWith(
        `/projects/${projectId}/threads/thread-9`,
        undefined,
      );
    }
  });
});
