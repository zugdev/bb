/** @vitest-environment jsdom */
import { createStore } from "jotai";
import { afterEach, describe, expect, it } from "vitest";
import { emptyPromptDraftState } from "@bb/client-core";
import { getPromptDraftAccessor } from "@/hooks/usePromptDraftStorage";
import { splitLayoutAtom } from "./atoms";
import { listPanes } from "./ops";
import {
  composerDraftScope,
  recordClosedPaneAtom,
  reopenClosedSplitItemAtom,
  splitTabsAtom,
} from "./tabs";
import type { SplitLayout } from "./types";

afterEach(() => window.localStorage.clear());

describe("reopening a closed pane", () => {
  it("reopens beside a composer that holds a draft and into one that is empty", () => {
    const store = createStore();
    const composer: SplitLayout = {
      root: { type: "pane", paneId: "pane-1", content: { kind: "new-thread" } },
      focusedPaneId: "pane-1",
    };
    const closed = {
      kind: "thread",
      projectId: "p1",
      threadId: "b",
    } as const;
    const draft = getPromptDraftAccessor(
      composerDraftScope(composer, store.get(splitTabsAtom), "pane-1"),
    );
    store.set(splitLayoutAtom, composer);
    store.set(recordClosedPaneAtom, closed);
    draft.setDraft({ ...emptyPromptDraftState(), text: "half written" });

    const reopened = store.set(reopenClosedSplitItemAtom);
    expect(listPanes(reopened!.root).map((pane) => pane.content)).toEqual([
      { kind: "new-thread" },
      closed,
    ]);
    expect(draft.getCurrent().text).toBe("half written");

    draft.clear();
    store.set(splitLayoutAtom, composer);
    store.set(recordClosedPaneAtom, closed);
    expect(
      listPanes(store.set(reopenClosedSplitItemAtom)!.root).map(
        (pane) => pane.content,
      ),
    ).toEqual([closed]);
  });
});
