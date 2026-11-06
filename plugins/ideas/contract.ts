import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const ideaSchema = z
  .object({
    id: z.string(),
    prompt: z.string().min(1),
    projectId: z.string().min(1),
    providerId: z.string().min(1),
    createdAt: z.number(),
    threadId: z.string().nullable(),
    startedAt: z.number().nullable(),
  })
  .strict();

export type Idea = z.infer<typeof ideaSchema>;

const forecastSchema = z
  .object({
    providerId: z.string(),
    displayName: z.string(),
    usedPercent: z.number(),
    projectedPercent: z.number(),
    resetsAt: z.number(),
    startsIdeas: z.boolean(),
  })
  .strict();

export type ProviderForecast = z.infer<typeof forecastSchema>;

const optionSchema = z.object({ id: z.string(), name: z.string() }).strict();

export const ideasRpcContract = defineRpcContract({
  "ideas.state": {
    tags: () => ["state"],
    input: z.object({}).strict(),
    output: z
      .object({
        ideas: z.array(ideaSchema),
        forecasts: z.array(forecastSchema),
        projects: z.array(optionSchema),
        providers: z.array(optionSchema),
        startWithinHours: z.number(),
        targetPercent: z.number(),
      })
      .strict(),
  },
  "ideas.add": {
    input: ideaSchema.pick({ prompt: true, projectId: true, providerId: true }),
    output: ideaSchema,
  },
  "ideas.remove": {
    input: z.object({ id: z.string() }).strict(),
    output: z.object({ ok: z.literal(true) }).strict(),
  },
  "ideas.start": {
    input: z.object({ id: z.string() }).strict(),
    output: ideaSchema,
  },
});
