import type { ThreadEvent, ThreadEventType } from "@bb/domain";
import type { SessionsReadResult } from "@bb/provider-bridge-protocol";
import { createDeltaAssembler } from "@bb/provider-bridge-protocol/assembler";
import type {
  ImportedProviderSession,
  ImportedProviderSessionEvent,
} from "./types.js";

const IMPORT_ASSEMBLY_THREAD_ID = "provider-session-import";

const IMPORTED_EVENT_TYPES: ReadonlySet<ThreadEventType> = new Set([
  "turn/started",
  "item/completed",
  "item/backgroundTask/completed",
  "thread/compacted",
  "turn/completed",
]);

function isImportedEvent(event: ThreadEvent): boolean {
  return IMPORTED_EVENT_TYPES.has(event.type);
}

export function assembleImportedProviderSession(args: {
  providerId: string;
  session: SessionsReadResult;
}): ImportedProviderSession {
  const assembler = createDeltaAssembler({
    providerId: args.providerId,
    textDeltaFlushMs: 0,
    progressThrottleMs: 0,
  });
  return {
    sessionId: args.session.sessionId,
    cwd: args.session.cwd,
    truncated: args.session.truncated,
    turns: args.session.turns.map((turn) => ({
      prompt: turn.prompt,
      startedAt: turn.startedAt,
      events: turn.steps.flatMap((step): ImportedProviderSessionEvent[] =>
        assembler
          .assemble({
            threadId: IMPORT_ASSEMBLY_THREAD_ID,
            deltas: step.deltas,
          })
          .filter(isImportedEvent)
          .map((event) => ({ at: step.at, event })),
      ),
    })),
  };
}
