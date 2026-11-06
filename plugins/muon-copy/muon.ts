import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { taskIdSchema, type FileKind, type ReadResult } from "./block";

export const DEFAULT_MUON_ROOT = "/Users/gus/prog/muon";

export function muonFilePath(root: string, task: string, file: FileKind): string {
  const id = taskIdSchema.parse(task);
  return file === "instruction"
    ? join(root, "tasks", id, "instruction.md")
    : join(root, "state", id, "survey.md");
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
