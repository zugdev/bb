import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const backlogItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  createdAt: z.number(),
});
export type BacklogItem = z.infer<typeof backlogItemSchema>;

const projectInput = z.object({ projectId: z.string().min(1) }).strict();

export const backlogRpcContract = defineRpcContract({
  "backlog.list": {
    tags: (input) => [`backlog:${input.projectId}`],
    input: projectInput,
    output: z.object({ items: z.array(backlogItemSchema) }).strict(),
  },
  "backlog.add": {
    input: z.object({ projectId: z.string().min(1), title: z.string().trim().min(1).max(200) }).strict(),
    output: backlogItemSchema,
  },
  "backlog.done": {
    input: z.object({ projectId: z.string().min(1), id: z.string() }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
});
