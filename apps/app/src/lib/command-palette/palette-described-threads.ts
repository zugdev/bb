import type { ThreadListEntry } from "@bb/domain";
import { sdk } from "@/lib/sdk";

export async function listThreadsInOrder(
  threadIds: readonly string[],
): Promise<ThreadListEntry[]> {
  const ids = [...new Set(threadIds)];
  if (ids.length === 0) return [];
  const [active, archived] = await Promise.all([
    sdk.threads.list({ threadIds: ids, archived: false }),
    sdk.threads.list({ threadIds: ids, archived: true }),
  ]);
  const byId = new Map(
    [...active, ...archived].map((thread) => [thread.id, thread]),
  );
  return ids.flatMap((id) => byId.get(id) ?? []);
}
