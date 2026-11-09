import { describe, expect, it } from "vitest";
import { makeThreadListEntry } from "@bb/test-helpers/domain-fixtures";
import {
  inboxQueue,
  inboxSections,
  nextInboxStep,
  nextSnoozeWake,
} from "./inbox-queue";

const idle = (id: string, latestAttentionAt: number, extra = {}) =>
  makeThreadListEntry({
    id,
    status: "idle",
    latestAttentionAt,
    lastUserMessageAt: 1,
    ...extra,
  });

const NOW = 1_000;

const ids = (threads: readonly { id: string }[]) =>
  threads.map((thread) => thread.id);

describe("inboxSections", () => {
  it("lists idle threads awaiting a reply, oldest first", () => {
    const sections = inboxSections(
      [
        idle("new", 30),
        idle("old", 10),
        idle("replied", 20, { lastUserMessageAt: 25 }),
        idle("archived", 5, { archivedAt: 6 }),
        idle("child", 5, { parentThreadId: "old" }),
      ],
      NOW,
    );
    expect(ids(sections.waitingOnYou)).toEqual(["old", "new"]);
    expect(ids(inboxQueue(sections))).toEqual(["old", "new"]);
  });

  it("puts running agents under working and out of the queue", () => {
    const sections = inboxSections(
      [
        idle("running", 5, {
          status: "active",
          runtime: { displayStatus: "active" },
        }),
      ],
      NOW,
    );
    expect(ids(sections.working)).toEqual(["running"]);
    expect(inboxQueue(sections)).toEqual([]);
  });

  it("hides a snoozed thread until it wakes, then lists it as a new arrival", () => {
    const threads = [
      idle("snoozed", 10, { snoozedUntil: NOW + 50 }),
      idle("other", 20),
    ];
    const asleep = inboxSections(threads, NOW);
    expect(ids(asleep.snoozed)).toEqual(["snoozed"]);
    expect(ids(inboxQueue(asleep))).toEqual(["other"]);
    expect(nextSnoozeWake(threads, NOW)).toBe(NOW + 50);

    const awake = inboxSections(threads, NOW + 50);
    expect(awake.snoozed).toEqual([]);
    expect(ids(inboxQueue(awake))).toEqual(["other", "snoozed"]);
  });

  it("shows a pending question even while snoozed", () => {
    const sections = inboxSections(
      [
        idle("blocked", 10, {
          snoozedUntil: NOW + 50,
          hasPendingInteraction: true,
        }),
      ],
      NOW,
    );
    expect(ids(sections.needsAnswer)).toEqual(["blocked"]);
    expect(sections.snoozed).toEqual([]);
  });
});

describe("nextInboxStep", () => {
  const queue = [idle("a", 10), idle("b", 20)];

  it("opens the oldest thread from a blank tab", () => {
    expect(nextInboxStep(queue, null, undefined)).toEqual({
      kind: "open",
      thread: queue[0],
    });
  });

  it("stays while the shown thread still needs a reply", () => {
    expect(nextInboxStep(queue, "b", "b")).toEqual({ kind: "stay" });
  });

  it("advances once the shown thread was replied to or archived", () => {
    expect(nextInboxStep(queue.slice(1), "a", "a")).toEqual({
      kind: "open",
      thread: queue[1],
    });
    expect(nextInboxStep(queue.slice(1), null, "a")).toEqual({
      kind: "open",
      thread: queue[1],
    });
  });

  it("finishes when the last thread leaves the queue", () => {
    expect(nextInboxStep([], "a", "a")).toEqual({ kind: "done" });
    expect(nextInboxStep([], null, null)).toEqual({ kind: "stay" });
  });

  it("leaves a thread the user opened by hand alone", () => {
    expect(nextInboxStep(queue, "elsewhere", "a")).toEqual({ kind: "stay" });
  });

  it("moves on from a composer an archive left behind while threads still wait", () => {
    expect(nextInboxStep(queue, null, "a")).toEqual({
      kind: "open",
      thread: queue[0],
    });
  });
});
