import {
  getEnvironment,
  getThread,
  listThreadDeletionTree,
  markThreadDeleted,
} from "@bb/db";
import type { AppDeps } from "../../types.js";
import { emitPluginThreadDeleted } from "../plugins/plugin-thread-events.js";
import { cancelAbandonedProviderCreations } from "./thread-environment-providers.js";
import { requestThreadStorageDeletion } from "./thread-lifecycle.js";

export function deleteThreadTree(deps: AppDeps, threadId: string): void {
  const dependents = listThreadDeletionTree(deps.db, threadId);
  markThreadDeleted(deps.db, deps.hub, { threadId });
  for (const dependent of dependents) {
    const deleted = getThread(deps.db, dependent.id);
    if (!deleted) continue;
    if (dependent.deletedAt === null) emitPluginThreadDeleted(deleted);
    cancelAbandonedProviderCreations(deps, deleted.id);
    deps.terminalSessions.closeDeletedThreadTerminals({
      threadId: deleted.id,
    });
    requestThreadStorageDeletion(
      deps,
      deleted,
      deleted.environmentId === null
        ? null
        : getEnvironment(deps.db, deleted.environmentId),
    );
  }
}
