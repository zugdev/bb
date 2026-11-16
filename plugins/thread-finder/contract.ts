import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const threadFinderHostContract = defineRpcContract({
  ask: {
    input: z.object({ prompt: z.string().min(1), model: z.string().min(1) }).strict(),
    output: z.object({ text: z.string() }).strict(),
  },
});

const matchSchema = z
  .object({
    threadId: z.string(),
    projectId: z.string(),
    title: z.string(),
    projectName: z.string(),
    archived: z.boolean(),
  })
  .strict();
export type ThreadMatch = z.infer<typeof matchSchema>;

export const threadFinderRpcContract = defineRpcContract({
  find: {
    input: z.object({ description: z.string().trim().min(1) }).strict(),
    output: z.object({ matches: z.array(matchSchema) }).strict(),
  },
});
