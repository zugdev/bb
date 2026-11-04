import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { notificationSchema, reminderSchema } from "./home.js";

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
        reminders: z.array(reminderSchema),
        notifications: z.array(notificationSchema),
      })
      .strict(),
  },
  "assistant.check": {
    input: z.object({}).strict(),
    output: z.object({ slack: z.number(), email: z.number() }).strict(),
  },
});
