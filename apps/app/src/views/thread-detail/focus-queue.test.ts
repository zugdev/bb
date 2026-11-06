import { describe, expect, it } from "vitest";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import { focusQueue, nextFocusStep } from "./focus-queue";

const idle = (id: string, latestAttentionAt: number, extra = {}) =>
  makeThreadListEntry({
    id,
    status: "idle",
    latestAttentionAt,
    lastUserMessageAt: 1,
    ...extra,
  });

describe("focusQueue", () => {
  it("lists idle threads awaiting a reply, oldest first", () => {
    const queue = focusQueue([
      idle("new", 30),
      idle("old", 10),
      idle("replied", 20, { lastUserMessageAt: 25 }),
      idle("archived", 5, { archivedAt: 6 }),
      idle("child", 5, { parentThreadId: "old" }),
      idle("running", 5, {
        status: "active",
        runtime: { displayStatus: "active" },
      }),
    ]);
    expect(queue.map((thread) => thread.id)).toEqual(["old", "new"]);
  });
});

describe("nextFocusStep", () => {
  const queue = [idle("a", 10), idle("b", 20)];

  it("opens the oldest thread from a blank tab", () => {
    expect(nextFocusStep(queue, null, undefined)).toEqual({
      kind: "open",
      thread: queue[0],
    });
  });

  it("stays while the shown thread still needs a reply", () => {
    expect(nextFocusStep(queue, "b", "b")).toEqual({ kind: "stay" });
  });

  it("advances once the shown thread was replied to or archived", () => {
    expect(nextFocusStep(queue.slice(1), "a", "a")).toEqual({
      kind: "open",
      thread: queue[1],
    });
    expect(nextFocusStep(queue.slice(1), null, "a")).toEqual({
      kind: "open",
      thread: queue[1],
    });
  });

  it("finishes when the last thread leaves the queue", () => {
    expect(nextFocusStep([], "a", "a")).toEqual({ kind: "done" });
    expect(nextFocusStep([], null, null)).toEqual({ kind: "stay" });
  });

  it("leaves a thread the user opened by hand alone", () => {
    expect(nextFocusStep(queue, "elsewhere", "a")).toEqual({ kind: "stay" });
  });

  it("moves on from a composer an archive left behind while threads still wait", () => {
    expect(nextFocusStep(queue, null, "a")).toEqual({
      kind: "open",
      thread: queue[0],
    });
  });
});
