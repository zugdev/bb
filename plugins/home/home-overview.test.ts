import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { makeProject, makeThread } from "./fixtures";
import {
  filterHomeThreads,
  homeThreadDot,
  repoWebUrl,
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

describe("nextCycledProject", () => {
  it("cycles No project and the recent projects, wrapping around", () => {
    const recent = [makeProject("a"), makeProject("b")];
    expect(nextCycledProject(null, recent)).toBe("a");
    expect(nextCycledProject("a", recent)).toBe("b");
    expect(nextCycledProject("b", recent)).toBeNull();
    expect(nextCycledProject("elsewhere", recent)).toBeNull();
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

describe("filterHomeThreads", () => {
  const DAY = 86_400_000;
  const now = 100 * DAY;
  const threads = [
    makeThread({ id: "run", updatedAt: now, ...working }),
    makeThread({ id: "ask", updatedAt: now - 20 * DAY, ...waiting }),
    makeThread({ id: "old", updatedAt: now - 20 * DAY }),
    makeThread({ id: "child", parentThreadId: "old", updatedAt: now }),
  ];
  const ids = (status: "all" | "running" | "needs-you", olderThanDays: number | null) =>
    filterHomeThreads(threads, { status, olderThanDays }, now).map((t) => t.id);

  it("keeps running or waiting top level threads and every child", () => {
    expect(ids("running", null)).toEqual(["run", "child"]);
    expect(ids("needs-you", null)).toEqual(["ask", "child"]);
  });

  it("drops threads updated within the age window", () => {
    expect(ids("all", 7)).toEqual(["ask", "old", "child"]);
    expect(ids("needs-you", 7)).toEqual(["ask", "child"]);
  });
});
