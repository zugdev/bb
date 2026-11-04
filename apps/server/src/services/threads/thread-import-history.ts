import {
  appendImportedThreadEventsInTransaction,
  getLatestThreadSequence,
  listLiveThreadIdsClaimingProviderThread,
  type AppendImportedThreadEventArgs,
  type DbQueryConnection,
} from "@bb/db";
import {
  threadScope,
  turnScope,
  type ResolvedThreadExecutionOptions,
  type Thread,
  type ThreadEvent,
  type ThreadEventType,
} from "@bb/domain";
import type { ProviderSessionsReadResult } from "@bb/host-daemon-contract";
import { ApiError } from "../../errors.js";
import type { AppDeps } from "../../types.js";
import { createClientTurnRequestId } from "./thread-events.js";
import { INHERITED_EVENT_TYPES } from "./thread-fork-history.js";

type InheritedEventType = (typeof INHERITED_EVENT_TYPES)[number];

export interface ImportedThreadSession {
  providerThreadId: string;
  turns: ProviderSessionsReadResult["turns"];
}

type ImportedTurn = ImportedThreadSession["turns"][number];

const PROVIDER_IMPORTED_EVENT_TYPES: ReadonlySet<ThreadEventType> = new Set([
  "turn/started",
  "item/completed",
  "item/backgroundTask/completed",
  "thread/compacted",
  "turn/completed",
] satisfies InheritedEventType[]);

export function assertProviderSessionUnclaimed(
  db: DbQueryConnection,
  args: { providerId: string; providerThreadId: string },
): void {
  const [claimant] = listLiveThreadIdsClaimingProviderThread(db, args);
  if (claimant !== undefined) {
    throw new ApiError(
      409,
      "provider_session_already_imported",
      `Session ${args.providerThreadId} is already open in thread ${claimant}`,
    );
  }
}

function toEventArgs(
  args: {
    environmentId: string | null;
    providerThreadId: string;
    threadId: string;
  },
  at: number,
  event: ThreadEvent,
): AppendImportedThreadEventArgs {
  const { type, scope, threadId: _threadId, ...data } = event;
  return {
    threadId: args.threadId,
    environmentId: args.environmentId,
    providerThreadId: args.providerThreadId,
    scope,
    type,
    createdAt: at,
    data:
      "providerThreadId" in data
        ? { ...data, providerThreadId: args.providerThreadId }
        : data,
  } as AppendImportedThreadEventArgs;
}

function belongsToTurn(event: ThreadEvent, turnId: string): boolean {
  return event.scope.kind === "turn" && event.scope.turnId === turnId;
}

function buildImportedTurnEventArgs(
  args: {
    environmentId: string | null;
    execution: ResolvedThreadExecutionOptions;
    providerThreadId: string;
    threadId: string;
  },
  turn: ImportedTurn,
): AppendImportedThreadEventArgs[] {
  const started = turn.events.find(
    ({ event }) => event.type === "turn/started",
  );
  if (started === undefined || started.event.scope.kind !== "turn") {
    return [];
  }
  const turnId = started.event.scope.turnId;
  const rest = turn.events.filter(
    ({ event }) =>
      event.type !== "turn/started" &&
      PROVIDER_IMPORTED_EVENT_TYPES.has(event.type) &&
      belongsToTurn(event, turnId),
  );
  const requestId = createClientTurnRequestId();
  return [
    {
      threadId: args.threadId,
      environmentId: args.environmentId,
      scope: threadScope(),
      type: "client/turn/requested",
      createdAt: turn.startedAt,
      data: {
        direction: "outbound",
        requestId,
        source: "tell",
        initiator: "user",
        senderThreadId: null,
        input: [{ type: "text", text: turn.prompt, mentions: [] }],
        target: { kind: "new-turn" },
        request: { method: "turn/start", params: {} },
        execution: args.execution,
      },
    },
    toEventArgs(args, started.at, started.event),
    {
      threadId: args.threadId,
      environmentId: args.environmentId,
      providerThreadId: args.providerThreadId,
      scope: turnScope(turnId),
      type: "turn/input/accepted",
      createdAt: turn.startedAt,
      data: {
        providerThreadId: args.providerThreadId,
        clientRequestId: requestId,
      },
    },
    ...rest.map(({ at, event }) => toEventArgs(args, at, event)),
  ];
}

export function appendImportedSessionHistory(
  deps: Pick<AppDeps, "db" | "hub">,
  args: {
    execution: ResolvedThreadExecutionOptions;
    session: ImportedThreadSession;
    thread: Pick<Thread, "environmentId" | "id" | "providerId">;
  },
): void {
  const eventArgs = {
    environmentId: args.thread.environmentId,
    execution: args.execution,
    providerThreadId: args.session.providerThreadId,
    threadId: args.thread.id,
  };
  const rows = [
    ...args.session.turns.flatMap((turn) =>
      buildImportedTurnEventArgs(eventArgs, turn),
    ),
    {
      threadId: args.thread.id,
      environmentId: args.thread.environmentId,
      providerThreadId: args.session.providerThreadId,
      scope: threadScope(),
      type: "thread/identity",
      createdAt: Date.now(),
      data: { providerThreadId: args.session.providerThreadId },
    } satisfies AppendImportedThreadEventArgs,
  ];
  deps.db.transaction(
    (tx) => {
      assertProviderSessionUnclaimed(tx, {
        providerId: args.thread.providerId,
        providerThreadId: args.session.providerThreadId,
      });
      appendImportedThreadEventsInTransaction(tx, rows);
    },
    { behavior: "immediate" },
  );
  deps.hub.notifyThread(args.thread.id, ["events-appended"], {
    timelineSequence: getLatestThreadSequence(deps.db, {
      threadId: args.thread.id,
    }),
    eventTypes: [...new Set(rows.map((row) => row.type))],
  });
}
