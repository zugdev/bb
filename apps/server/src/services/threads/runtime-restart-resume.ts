import { renderTemplate } from "@bb/templates";
import type { LoggedPendingInteractionWorkSessionDeps } from "../../types.js";
import { queueParentSystemMessage } from "./parent-system-messages.js";
import type { InterruptActiveThreadsResult } from "./thread-lifecycle.js";

export async function resumeThreadsInterruptedByRestart(
  deps: LoggedPendingInteractionWorkSessionDeps,
  interrupted: readonly InterruptActiveThreadsResult[],
  threadsWithStoppedBackgroundTasks: ReadonlySet<string>,
): Promise<void> {
  const threadIds = new Set([
    ...interrupted.flatMap((result) =>
      result.threads
        .filter((thread) => thread.interruptedTurnId !== null)
        .map((thread) => thread.threadId),
    ),
    ...threadsWithStoppedBackgroundTasks,
  ]);
  for (const threadId of threadIds) {
    try {
      await queueParentSystemMessage(deps, {
        parentThreadId: threadId,
        input: [
          {
            type: "text",
            text: renderTemplate("systemMessageRuntimeRestarted", {}),
            mentions: [],
          },
        ],
        systemMessageKind: "runtime-restarted",
        systemMessageSubject: null,
      });
    } catch (error) {
      deps.logger.error(
        { err: error, threadId },
        "Failed to resume a thread interrupted by a restart",
      );
    }
  }
}
