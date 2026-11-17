import { describe, expect, it, vi } from "vitest";
import { eq } from "drizzle-orm";
import type { DbTransaction } from "../../src/connection.js";
import { noopNotifier } from "../../src/notifier.js";
import { events, threads } from "../../src/schema.js";
import {
  applyThreadLifecycleEvent,
  applyThreadLifecycleEventInTransaction,
  createThread,
  getThread,
  markThreadDeleted,
  requireThreadLifecycleEventApplied,
  ThreadLifecycleEventNotAppliedError,
} from "../../src/data/threads.js";
import { createProject } from "../../src/data/projects.js";
import { upsertHost } from "../../src/data/hosts.js";
import { withWriteAfterFirstRead } from "../helpers/interleave.js";
import { createMigratedConnection } from "../../src/testing.js";

function setup() {
  const db = createMigratedConnection();
  const host = upsertHost(db, noopNotifier, {
    name: "test-host",
  });
  const { project } = createProject(db, noopNotifier, {
    name: "test-project",
    source: { type: "local_path", hostId: host.id, path: "/tmp/test" },
  });
  return { db, host, project };
}

describe("applyThreadLifecycleEvent", () => {
  it("applies a legal event and persists the row", () => {
    const { db, project } = setup();
    const thread = createThread(db, noopNotifier, {
      projectId: project.id,
      providerId: "codex",
      status: "starting",
    });

    const outcome = applyThreadLifecycleEvent(db, {
      event: { type: "run.started" },
      threadId: thread.id,
    });

    expect(outcome.applied).toBe(true);
    if (outcome.applied) {
      expect(outcome.thread.status).toBe("active");
    }
    expect(getThread(db, thread.id)?.status).toBe("active");
  });

  it("applies events inside an existing transaction", () => {
    const { db, project } = setup();
    const thread = createThread(db, noopNotifier, {
      projectId: project.id,
      providerId: "codex",
      status: "active",
    });

    const outcome = db.transaction((tx) =>
      applyThreadLifecycleEventInTransaction(tx, {
        event: { type: "run.succeeded" },
        threadId: thread.id,
      }),
    );

    expect(outcome.applied).toBe(true);
    expect(getThread(db, thread.id)?.status).toBe("idle");
  });

  it("no-ops as illegal-transition and leaves the row untouched", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      const { db, project } = setup();
      const thread = createThread(db, noopNotifier, {
        projectId: project.id,
        providerId: "codex",
        status: "idle",
      });

      vi.setSystemTime(2_000);
      const outcome = applyThreadLifecycleEvent(db, {
        event: { type: "run.succeeded" },
        threadId: thread.id,
      });

      expect(outcome).toEqual({
        applied: false,
        detail: "no transition for run.succeeded from status idle",
        reason: "illegal-transition",
      });
      expect(getThread(db, thread.id)).toEqual(thread);
    } finally {
      vi.useRealTimers();
    }
  });

  it("no-ops as superseded when the thread is deleted", () => {
    const { db, project } = setup();
    const thread = createThread(db, noopNotifier, {
      projectId: project.id,
      providerId: "codex",
      status: "starting",
    });
    markThreadDeleted(db, noopNotifier, { threadId: thread.id });
    const beforeRow = getThread(db, thread.id);

    const outcome = applyThreadLifecycleEvent(db, {
      event: { type: "run.started" },
      threadId: thread.id,
    });

    expect(outcome).toEqual({
      applied: false,
      detail: "deletedAt set",
      reason: "superseded",
    });
    expect(getThread(db, thread.id)).toEqual(beforeRow);
  });

  it("no-ops as not-found for a missing thread", () => {
    const { db } = setup();
    const outcome = applyThreadLifecycleEvent(db, {
      event: { type: "run.started" },
      threadId: "thr_nonexistent",
    });
    expect(outcome).toEqual({
      applied: false,
      detail: "thread not found: thr_nonexistent",
      reason: "not-found",
    });
  });

  it("no-ops as cas-conflict when the status changes between load and update", () => {
    const { db, project } = setup();
    const thread = createThread(db, noopNotifier, {
      projectId: project.id,
      providerId: "codex",
      status: "starting",
    });

    const outcome = db.transaction((tx: DbTransaction) => {
      const interleaved = withWriteAfterFirstRead(tx, () => {
        tx.update(threads)
          .set({ status: "idle" })
          .where(eq(threads.id, thread.id))
          .run();
      });
      return applyThreadLifecycleEventInTransaction(interleaved, {
        event: { type: "run.started" },
        threadId: thread.id,
      });
    });

    expect(outcome).toEqual({
      applied: false,
      detail: "status changed from starting while applying run.started",
      reason: "cas-conflict",
    });
    expect(getThread(db, thread.id)?.status).toBe("idle");
  });

  it("sets latestAttentionAt only on attention-worthy transitions", () => {
    vi.useFakeTimers();
    try {
      vi.setSystemTime(1_000);
      const { db, project } = setup();

      const cases = [
        {
          attention: true,
          event: { type: "run.succeeded" },
          parent: false,
          status: "active",
          target: "idle",
        },
        {
          attention: false,
          event: { type: "run.succeeded" },
          parent: true,
          status: "active",
          target: "idle",
        },
        {
          attention: false,
          event: { type: "run.started" },
          parent: false,
          status: "starting",
          target: "active",
        },
        {
          attention: true,
          event: { type: "run.failed" },
          parent: false,
          status: "starting",
          target: "error",
        },
      ] as const;

      let now = 1_000;
      for (const testCase of cases) {
        const parentThreadId = testCase.parent
          ? createThread(db, noopNotifier, {
              projectId: project.id,
              providerId: "codex",
            }).id
          : null;
        const thread = createThread(db, noopNotifier, {
          parentThreadId,
          projectId: project.id,
          providerId: "codex",
          status: testCase.status,
        });

        now += 1_000;
        vi.setSystemTime(now);
        const outcome = applyThreadLifecycleEvent(db, {
          event: testCase.event,
          threadId: thread.id,
        });

        expect(outcome.applied).toBe(true);
        if (!outcome.applied) {
          continue;
        }
        expect(outcome.thread.status).toBe(testCase.target);
        expect(outcome.thread.updatedAt).toBe(now);
        expect(outcome.thread.latestAttentionAt).toBe(
          testCase.attention ? now : thread.latestAttentionAt,
        );
      }
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("automation turns", () => {
  function finishTurnSentBy(args: {
    requestOriginPluginId: string | null;
    threadOriginPluginId: string | null;
  }) {
    const { db, project } = setup();
    const thread = createThread(db, noopNotifier, {
      originPluginId: args.threadOriginPluginId,
      projectId: project.id,
      providerId: "codex",
      status: "active",
    });
    db.update(threads)
      .set({ latestAttentionAt: 1, snoozedUntil: Date.now() + 60_000 })
      .where(eq(threads.id, thread.id))
      .run();
    db.insert(events)
      .values({
        id: "evt_request",
        threadId: thread.id,
        scopeKind: "thread",
        sequence: 1,
        type: "client/turn/requested",
        data: JSON.stringify(
          args.requestOriginPluginId === null
            ? {}
            : { originPluginId: args.requestOriginPluginId },
        ),
        createdAt: Date.now(),
      })
      .run();
    return requireThreadLifecycleEventApplied(
      applyThreadLifecycleEvent(db, {
        event: { type: "run.succeeded" },
        threadId: thread.id,
      }),
    );
  }

  it("keeps attention and snooze when an automation prompts an existing thread", () => {
    const thread = finishTurnSentBy({
      requestOriginPluginId: "automations",
      threadOriginPluginId: null,
    });
    expect(thread.latestAttentionAt).toBe(1);
    expect(thread.snoozedUntil).not.toBeNull();
  });

  it("raises attention for threads the automation spawned", () => {
    const thread = finishTurnSentBy({
      requestOriginPluginId: "automations",
      threadOriginPluginId: "automations",
    });
    expect(thread.latestAttentionAt).toBeGreaterThan(1);
    expect(thread.snoozedUntil).toBeNull();
  });

  it("raises attention for turns the user sent", () => {
    const thread = finishTurnSentBy({
      requestOriginPluginId: null,
      threadOriginPluginId: null,
    });
    expect(thread.latestAttentionAt).toBeGreaterThan(1);
    expect(thread.snoozedUntil).toBeNull();
  });
});

describe("requireThreadLifecycleEventApplied", () => {
  it("throws a typed error carrying reason and detail on a no-op", () => {
    const { db, project } = setup();
    const thread = createThread(db, noopNotifier, {
      projectId: project.id,
      providerId: "codex",
      status: "idle",
    });

    const outcome = applyThreadLifecycleEvent(db, {
      event: { type: "run.succeeded" },
      threadId: thread.id,
    });
    let caught: ThreadLifecycleEventNotAppliedError | null = null;
    try {
      requireThreadLifecycleEventApplied(outcome);
    } catch (error) {
      if (error instanceof ThreadLifecycleEventNotAppliedError) {
        caught = error;
      }
    }
    expect(caught?.reason).toBe("illegal-transition");
    expect(caught?.detail).toBe(
      "no transition for run.succeeded from status idle",
    );
  });
});
