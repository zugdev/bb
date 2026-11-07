import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { taskIdSchema, type FileKind, type ReadResult } from "./block";

export const DEFAULT_MUON_ROOT = "/Users/gus/prog/muon";

export function muonFilePath(root: string, task: string, file: FileKind): string {
  const id = taskIdSchema.parse(task);
  if (file === "instruction") return join(root, "tasks", id, "instruction.md");
  return join(root, "state", id, file === "survey" ? "survey.md" : "review-response.md");
}

export async function readMuonFile(
  root: string,
  task: string,
  file: FileKind,
): Promise<ReadResult> {
  const path = muonFilePath(root, task, file);
  try {
    return { kind: "ok", text: await readFile(path, "utf8") };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      return { kind: "missing", path };
    }
    throw error;
  }
}
