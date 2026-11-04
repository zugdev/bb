import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const assistantRpcContract = defineRpcContract({
  "assistant.thread": {
    input: z.object({}).strict(),
    output: z.object({ threadId: z.string() }).strict(),
  },
  "assistant.badge": {
    tags: () => ["badge"],
    input: z.object({}).strict(),
    output: z.object({ unseen: z.number() }).strict(),
  },
  "assistant.seen": {
    input: z.object({}).strict(),
    output: z.object({ unseen: z.number() }).strict(),
  },
  "assistant.check": {
    input: z.object({}).strict(),
    output: z.object({ slack: z.number(), email: z.number() }).strict(),
  },
});
