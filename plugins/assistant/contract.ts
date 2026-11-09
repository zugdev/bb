import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { notificationSchema, reminderSchema, todoSchema } from "./home.js";

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
  "assistant.home": {
    tags: () => ["home"],
    input: z.object({}).strict(),
    output: z
      .object({
        todos: z.array(todoSchema),
        reminders: z.array(reminderSchema),
        notifications: z.array(notificationSchema),
      })
      .strict(),
  },
  "assistant.todoDone": {
    input: z.object({ id: z.string() }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  "assistant.check": {
    input: z.object({}).strict(),
    output: z.object({ slack: z.number(), email: z.number() }).strict(),
  },
});
