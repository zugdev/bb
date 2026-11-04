import { describe, expect, it } from "vitest";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import {
  homeThreadDot,
  moveHomeSection,
  overviewProjectThreads,
  repoWebUrl,
  homeAttention,
  liveThreadDescendants,
  pluginSectionId,
  resolveHomeSections,
  setHomeSectionHidden,
  sortAndFilterHomeThreads,
} from "./home-overview";

describe("overviewProjectThreads", () => {
  it("groups top level threads by what they need from you", () => {
    const overview = overviewProjectThreads([
      makeThreadListEntry({ id: "asks", hasPendingInteraction: true }),
      makeThreadListEntry({
        id: "works",
        status: "active",
        runtime: { displayStatus: "active" },
      }),
      makeThreadListEntry({
        id: "done",
        status: "idle",
        lastReadAt: 1,
        latestAttentionAt: 5,
      }),
      makeThreadListEntry({
        id: "quiet",
        lastReadAt: 10,
        latestAttentionAt: 5,
      }),
      makeThreadListEntry({ id: "child", parentThreadId: "asks" }),
      makeThreadListEntry({ id: "archived", archivedAt: 1 }),
    ]);

    expect(overview.needsYou.map((item) => item.thread.id)).toEqual(["asks"]);
    expect(overview.running.map((item) => item.thread.id)).toEqual(["works"]);
    expect(overview.unread.map((item) => item.thread.id)).toEqual(["done"]);
    expect(overview.quiet.map((item) => item.thread.id)).toEqual(["quiet"]);
  });

  it("maps thread status to the Home dot colours", () => {
    expect(
      homeThreadDot(makeThreadListEntry({ hasPendingInteraction: true })),
    ).toBe("waiting");
    expect(
      homeThreadDot(
        makeThreadListEntry({
          status: "active",
          runtime: { displayStatus: "active" },
        }),
      ),
    ).toBe("working");
    expect(
      homeThreadDot(
        makeThreadListEntry({
          status: "idle",
          lastReadAt: 1,
          latestAttentionAt: 5,
        }),
      ),
    ).toBe("done");
    expect(
      homeThreadDot(
        makeThreadListEntry({
          status: "error",
          lastReadAt: 1,
          latestAttentionAt: 5,
        }),
      ),
    ).toBe("failed");
    expect(
      homeThreadDot(
        makeThreadListEntry({ lastReadAt: 10, latestAttentionAt: 5 }),
      ),
    ).toBeNull();
  });
});

describe("parent status roll up", () => {
  const parent = makeThreadListEntry({
    id: "parent",
    lastReadAt: 10,
    latestAttentionAt: 5,
  });
  const working = {
    status: "active",
    runtime: { displayStatus: "active" },
  } as const;
  const waiting = { hasPendingInteraction: true } as const;
  const parentDot = (...others: ReturnType<typeof makeThreadListEntry>[]) =>
    homeThreadDot(parent, liveThreadDescendants([parent, ...others]));

  it.each([
    {
      name: "a working child",
      others: [
        makeThreadListEntry({ id: "c", parentThreadId: "parent", ...working }),
      ],
      dot: "working",
    },
    {
      name: "a child waiting for the user",
      others: [
        makeThreadListEntry({ id: "c", parentThreadId: "parent", ...waiting }),
      ],
      dot: "waiting",
    },
    {
      name: "a waiting grandchild over a working child",
      others: [
        makeThreadListEntry({ id: "c", parentThreadId: "parent", ...working }),
        makeThreadListEntry({ id: "g", parentThreadId: "c", ...waiting }),
      ],
      dot: "waiting",
    },
    {
      name: "an archived working child",
      others: [
        makeThreadListEntry({
          id: "c",
          parentThreadId: "parent",
          archivedAt: 1,
          ...working,
        }),
      ],
      dot: null,
    },
    {
      name: "a working grandchild under an archived child",
      others: [
        makeThreadListEntry({
          id: "c",
          parentThreadId: "parent",
          archivedAt: 1,
        }),
        makeThreadListEntry({ id: "g", parentThreadId: "c", ...working }),
      ],
      dot: null,
    },
    {
      name: "the user's own side chat waiting for input",
      others: [
        makeThreadListEntry({
          id: "c",
          parentThreadId: "parent",
          visibility: "hidden",
          originKind: "fork",
          originPluginId: "side-chat",
          ...waiting,
        }),
      ],
      dot: null,
    },
    {
      name: "a working thread with another parent",
      others: [
        makeThreadListEntry({ id: "c", parentThreadId: "other", ...working }),
      ],
      dot: null,
    },
  ])("shows $dot for $name", ({ others, dot }) => {
    expect(parentDot(...others)).toBe(dot);
  });

  it("puts a parent with a waiting child under needs you", () => {
    const overview = overviewProjectThreads([
      parent,
      makeThreadListEntry({ id: "c", parentThreadId: "parent", ...waiting }),
    ]);
    expect(overview.needsYou.map((item) => item.thread.id)).toEqual(["parent"]);
  });
});

describe("sortAndFilterHomeThreads", () => {
  it("sorts by your last message and falls back to creation time", () => {
    const threads = [
      makeThreadListEntry({ id: "old", lastUserMessageAt: 10, createdAt: 1 }),
      makeThreadListEntry({
        id: "never",
        lastUserMessageAt: null,
        createdAt: 20,
      }),
      makeThreadListEntry({ id: "new", lastUserMessageAt: 30, createdAt: 2 }),
      makeThreadListEntry({
        id: "Fix login",
        title: "Fix login",
        createdAt: 3,
      }),
    ];
    expect(
      sortAndFilterHomeThreads(threads, "message", "").map((t) => t.id),
    ).toEqual(["new", "never", "old", "Fix login"]);
    expect(
      sortAndFilterHomeThreads(threads, "message", "LOGIN").map((t) => t.id),
    ).toEqual(["Fix login"]);
    expect(
      sortAndFilterHomeThreads(threads, "message", "", true).map((t) => t.id),
    ).toEqual(["Fix login", "old", "never", "new"]);
  });
});

describe("home layout", () => {
  it("keeps saved order, appends new projects, and moves and hides sections", () => {
    const prefs = {
      order: ["project:b", "removed", "attention"],
      hidden: ["project:c"],
    };
    const { visible, hidden } = resolveHomeSections(prefs, ["a", "b", "c"]);
    expect(visible).toEqual(["project:b", "attention", "project:a"]);
    expect(hidden).toEqual(["project:c"]);

    const moved = moveHomeSection(prefs, visible, "project:a", "project:b");
    expect(resolveHomeSections(moved, ["a", "b", "c"]).visible).toEqual([
      "project:a",
      "project:b",
      "attention",
    ]);

    const shown = setHomeSectionHidden(prefs, visible, "project:c", false);
    expect(resolveHomeSections(shown, ["a", "b", "c"]).visible.at(-1)).toBe(
      "project:c",
    );
    const hiddenAttention = setHomeSectionHidden(
      prefs,
      visible,
      "attention",
      true,
    );
    expect(
      resolveHomeSections(hiddenAttention, ["a", "b", "c"]).hidden,
    ).toEqual(["attention", "project:c"]);
  });

  it("puts the attention panel first when the saved layout predates it", () => {
    const prefs = { order: ["needs-you", "project:a", "search"], hidden: [] };
    expect(resolveHomeSections(prefs, ["a", "b"]).visible).toEqual([
      "attention",
      "project:a",
      "project:b",
    ]);
  });

  it("builds a web url from ssh and https remotes", () => {
    expect(repoWebUrl("git@github.com:zugdev/bb.git")).toBe(
      "https://github.com/zugdev/bb",
    );
    expect(repoWebUrl("https://github.com/zugdev/bb.git")).toBe(
      "https://github.com/zugdev/bb",
    );
    expect(repoWebUrl(null)).toBeNull();
  });
});

describe("homeAttention", () => {
  it("merges needs you and unread replies across projects, newest attention first", () => {
    const attention = homeAttention([
      {
        threads: [
          makeThreadListEntry({
            id: "old-ask",
            hasPendingInteraction: true,
            latestAttentionAt: 10,
          }),
        ],
      },
      {
        threads: [
          makeThreadListEntry({
            id: "new-ask",
            hasPendingInteraction: true,
            latestAttentionAt: 30,
          }),
          makeThreadListEntry({ id: "quiet", latestAttentionAt: 40 }),
        ],
      },
    ]);
    expect(attention.needsYou.map((thread) => thread.id)).toEqual([
      "new-ask",
      "old-ask",
    ]);
    expect(attention.replies).toEqual([]);
  });
});

describe("resolveHomeSections with plugin sections", () => {
  it("places new plugin sections after the fixed ones and keeps a saved order", () => {
    const assistant = pluginSectionId("assistant", "assistant");
    expect(
      resolveHomeSections({ order: [], hidden: [] }, ["a"], [assistant])
        .visible,
    ).toEqual(["attention", assistant, "project:a"]);
    expect(
      resolveHomeSections(
        { order: ["project:a", assistant, "attention"], hidden: [] },
        ["a"],
        [assistant],
      ).visible,
    ).toEqual(["project:a", assistant, "attention"]);
    expect(
      resolveHomeSections({ order: [], hidden: [assistant] }, ["a"], []).hidden,
    ).toEqual([]);
  });
});
