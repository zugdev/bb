import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { makeProject, makeThread } from "./fixtures";
import {
  homeAttention,
  homeThreadDot,
  isHomeLayoutPrefs,
  latestThreads,
  moveHomeSection,
  pluginSectionId,
  repoWebUrl,
  resolveHomeSections,
  setHomeSectionHidden,
  sortAndFilterHomeThreads,
  liveThreadDescendants,
  needsYouThreads,
  nextCycledProject,
  NO_THREAD_DESCENDANTS,
} from "./home-overview";

const working = { status: "active", runtimeStatus: "active" } as const;
const waiting = { hasPendingInteraction: true } as const;

describe("homeThreadDot", () => {
  it("maps thread status to the dot colours", () => {
    const dot = (overrides: Partial<PluginSidebarThread>) =>
      homeThreadDot(makeThread({ id: "t", ...overrides }), NO_THREAD_DESCENDANTS);
    expect(dot(waiting)).toBe("waiting");
    expect(dot(working)).toBe("working");
    expect(dot({ isUnread: true })).toBe("done");
    expect(dot({ status: "error", runtimeStatus: "error", isUnread: true })).toBe(
      "failed",
    );
    expect(dot({})).toBeNull();
  });
});

describe("parent status roll up", () => {
  const parent = makeThread({ id: "parent" });
  const child = (overrides: Partial<PluginSidebarThread>) =>
    makeThread({ id: "c", parentThreadId: "parent", ...overrides });
  const parentDot = (...others: PluginSidebarThread[]) =>
    homeThreadDot(parent, liveThreadDescendants([parent, ...others]));

  it.each([
    { name: "a working child", others: [child(working)], dot: "working" },
    {
      name: "a child waiting for the user",
      others: [child(waiting)],
      dot: "waiting",
    },
    {
      name: "a waiting grandchild over a working child",
      others: [
        child(working),
        makeThread({ id: "g", parentThreadId: "c", ...waiting }),
      ],
      dot: "waiting",
    },
    {
      name: "an archived working child",
      others: [child({ archivedAt: 1, isArchived: true, ...working })],
      dot: null,
    },
    {
      name: "a working grandchild under an archived child",
      others: [
        child({ archivedAt: 1, isArchived: true }),
        makeThread({ id: "g", parentThreadId: "c", ...working }),
      ],
      dot: null,
    },
    {
      name: "the user's own side chat waiting for input",
      others: [
        child({
          isHidden: true,
          originKind: "fork",
          originPluginId: "side-chat",
          ...waiting,
        }),
      ],
      dot: null,
    },
    {
      name: "a working thread with another parent",
      others: [makeThread({ id: "c", parentThreadId: "other", ...working })],
      dot: null,
    },
  ])("shows $dot for $name", ({ others, dot }) => {
    expect(parentDot(...others)).toBe(dot);
  });

  it("puts a parent with a waiting child under Needs you", () => {
    expect(
      needsYouThreads([parent, child(waiting)]).map((thread) => thread.id),
    ).toEqual(["parent"]);
  });
});

describe("latestThreads", () => {
  it("sorts top level threads by your last message, falling back to creation time", () => {
    const threads = [
      makeThread({ id: "old", experimental_lastUserMessageAt: 10, createdAt: 1 }),
      makeThread({ id: "never", createdAt: 20 }),
      makeThread({ id: "new", experimental_lastUserMessageAt: 30, createdAt: 2 }),
      makeThread({ id: "skip", experimental_lastUserMessageAt: 40 }),
      makeThread({ id: "child", parentThreadId: "new", createdAt: 50 }),
    ];
    expect(
      latestThreads(threads, new Set(["skip"])).map((thread) => thread.id),
    ).toEqual(["new", "never", "old"]);
  });
});

describe("nextCycledProject", () => {
  it("cycles No project and the recent projects, wrapping around", () => {
    const recent = [makeProject("a"), makeProject("b")];
    expect(nextCycledProject(null, recent)).toBe("a");
    expect(nextCycledProject("a", recent)).toBe("b");
    expect(nextCycledProject("b", recent)).toBeNull();
    expect(nextCycledProject("elsewhere", recent)).toBeNull();
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

  it("accepts only saved layouts with string ids", () => {
    expect(isHomeLayoutPrefs({ order: ["a"], hidden: [] })).toBe(true);
    expect(isHomeLayoutPrefs({ order: [1], hidden: [] })).toBe(false);
    expect(isHomeLayoutPrefs(null)).toBe(false);
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
      makeThread({ id: "old-ask", projectId: "a", ...waiting, latestAttentionAt: 10 }),
      makeThread({ id: "new-ask", projectId: "b", ...waiting, latestAttentionAt: 30 }),
      makeThread({ id: "reply", projectId: "b", isUnread: true, latestAttentionAt: 20 }),
      makeThread({ id: "busy", projectId: "b", isUnread: true, ...working }),
      makeThread({ id: "quiet", projectId: "b", latestAttentionAt: 40 }),
    ]);
    expect(attention.needsYou.map((thread) => thread.id)).toEqual([
      "new-ask",
      "old-ask",
    ]);
    expect(attention.replies.map((thread) => thread.id)).toEqual(["reply"]);
  });
});

describe("sortAndFilterHomeThreads", () => {
  it("sorts by the chosen time, filters by title and reverses for oldest first", () => {
    const threads = [
      makeThread({ id: "old", experimental_lastUserMessageAt: 10, createdAt: 1, latestAttentionAt: 50 }),
      makeThread({ id: "never", createdAt: 20, latestAttentionAt: 5 }),
      makeThread({ id: "new", experimental_lastUserMessageAt: 30, createdAt: 2 }),
      makeThread({ id: "fix", title: "Fix login", displayTitle: "Fix login", createdAt: 3 }),
    ];
    const ids = (list: readonly PluginSidebarThread[]) => list.map((t) => t.id);
    expect(ids(sortAndFilterHomeThreads(threads, "message", ""))).toEqual(["new", "never", "old", "fix"]);
    expect(ids(sortAndFilterHomeThreads(threads, "message", "LOGIN"))).toEqual(["fix"]);
    expect(ids(sortAndFilterHomeThreads(threads, "message", "", true))).toEqual(["fix", "old", "never", "new"]);
    expect(ids(sortAndFilterHomeThreads(threads, "activity", ""))[0]).toBe("old");
    expect(ids(sortAndFilterHomeThreads(threads, "created", ""))[0]).toBe("never");
  });
});
