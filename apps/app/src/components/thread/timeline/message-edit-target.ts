import type { PromptInput } from "@bb/domain";
import type {
  TimelineRow,
  TimelineUserConversationRow,
} from "@bb/server-contract";
import type { ThreadTimelineEditMessageTarget } from "./types";

export function userMessageEditTarget(
  row: TimelineUserConversationRow,
): ThreadTimelineEditMessageTarget | null {
  if (
    row.initiator !== "user" ||
    row.turnRequest.isGrouped ||
    row.turnRequest.kind !== "message" ||
    row.turnRequest.status !== "accepted" ||
    (row.attachments?.imageUrls.length ?? 0) > 0
  ) {
    return null;
  }
  const input: PromptInput[] = [];
  if (row.text.trim().length > 0) {
    input.push({ type: "text", text: row.text, mentions: [...row.mentions] });
  }
  for (const path of row.attachments?.localImagePaths ?? []) {
    input.push({ type: "localImage", path });
  }
  for (const path of row.attachments?.localFilePaths ?? []) {
    const detail = row.attachments?.localFileDetails.find(
      (file) => file.path === path,
    );
    input.push({
      type: "localFile",
      path,
      ...(detail ? { name: detail.name } : {}),
      ...(detail?.sizeBytes == null ? {} : { sizeBytes: detail.sizeBytes }),
    });
  }
  return {
    messageId: row.id,
    expectedRequestSequence: row.sourceSeqStart,
    input,
  };
}

function lastUserMessage(
  rows: readonly TimelineRow[],
): TimelineUserConversationRow | null {
  for (let index = rows.length - 1; index >= 0; index -= 1) {
    const row = rows[index];
    if (row === undefined) continue;
    if (
      row.kind === "conversation" &&
      row.role === "user" &&
      row.initiator === "user"
    ) {
      return row;
    }
    if (row.kind === "turn" && row.children !== null) {
      const nested = lastUserMessage(row.children);
      if (nested !== null) return nested;
    }
  }
  return null;
}

export function lastUserMessageEditTarget(
  rows: readonly TimelineRow[],
): ThreadTimelineEditMessageTarget | null {
  const row = lastUserMessage(rows);
  return row === null ? null : userMessageEditTarget(row);
}
