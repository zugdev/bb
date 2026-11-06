import { z } from "zod";

export const taskIdSchema = z
  .string()
  .regex(/^[A-Za-z0-9_-][A-Za-z0-9_.-]*$/, "Not a muon task id");

export const fileKindSchema = z.enum(["instruction", "survey"]);
export type FileKind = z.infer<typeof fileKindSchema>;

export const blockSchema = z.object({ task: taskIdSchema }).strict();

export type ReadResult =
  | { kind: "ok"; text: string }
  | { kind: "missing"; path: string };
