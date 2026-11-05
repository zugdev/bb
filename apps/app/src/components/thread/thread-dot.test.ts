import { describe, expect, it } from "vitest";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import { liveThreadDescendants, threadDot } from "./thread-dot";

describe("threadDot", () => {
  it("maps thread status to the dot colours", () => {
    expect(
      threadDot(makeThreadListEntry({ hasPendingInteraction: true })),
    ).toBe("waiting");
    expect(
      threadDot(
        makeThreadListEntry({
          status: "active",
          runtime: { displayStatus: "active" },
        }),
      ),
    ).toBe("working");
    expect(
      threadDot(
        makeThreadListEntry({
          status: "idle",
          lastReadAt: 1,
          latestAttentionAt: 5,
        }),
      ),
    ).toBe("done");
    expect(
      threadDot(
        makeThreadListEntry({
          status: "error",
          lastReadAt: 1,
          latestAttentionAt: 5,
        }),
      ),
    ).toBe("failed");
    expect(
      threadDot(
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
    threadDot(parent, liveThreadDescendants([parent, ...others]));

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
});
