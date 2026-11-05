import { describe, expect, it } from "vitest";
import type { PluginSidebarThread } from "@get-bb/plugin-sdk/app";
import { makeProject, makeThread } from "./fixtures";
import {
  homeThreadDot,
  latestThreads,
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
