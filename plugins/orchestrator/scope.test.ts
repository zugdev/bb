import { describe, expect, it } from "vitest";
import { collectPaneThreadIds } from "./scope.js";

describe("collectPaneThreadIds", () => {
  it("collects every thread pane in a nested split once, in order", () => {
    const layout = {
      root: {
        type: "split",
        dir: "row",
        sizes: [50, 50],
        children: [
          { type: "pane", paneId: "pane-1", content: { kind: "thread", projectId: "p", threadId: "thr_a" } },
          {
            type: "split",
            dir: "col",
            sizes: [50, 50],
            children: [
              { type: "pane", paneId: "pane-2", content: { kind: "new-thread" } },
              { type: "pane", paneId: "pane-3", content: { kind: "thread", projectId: "p", threadId: "thr_b" } },
              { type: "pane", paneId: "pane-4", content: { kind: "thread", projectId: "p", threadId: "thr_a" } },
            ],
          },
        ],
      },
      focusedPaneId: "pane-1",
    };
    expect(collectPaneThreadIds(layout)).toEqual(["thr_a", "thr_b"]);
    expect(collectPaneThreadIds(null)).toEqual([]);
  });
});
