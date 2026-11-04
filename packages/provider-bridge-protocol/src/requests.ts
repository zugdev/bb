import {
  clientTurnRequestIdSchema,
  dynamicToolSchema,
  instructionModeSchema,
  promptInputSchema,
  threadProviderCommandsStateSchema,
} from "@bb/domain";
import { z } from "zod";
import { bridgeExecutionOptionsSchema } from "./execution-options.js";
import { threadDeltaSchema } from "./thread-delta.js";

export const BRIDGE_REQUEST_METHODS = {
  initialize: "initialize",
  modelList: "model/list",
  commandList: "commands/list",
  providerHealth: "provider/health",
  providerUsage: "provider/usage",
  providerInstallationStatus: "provider/installation/status",
  providerInstallationRun: "provider/installation/run",
  threadStart: "thread/start",
  threadResume: "thread/resume",
  threadFork: "thread/fork",
  threadStop: "thread/stop",
  threadDiscard: "thread/discard",
  threadNameSet: "thread/name/set",
  threadArchive: "thread/archive",
  threadUnarchive: "thread/unarchive",
  threadGoalClear: "thread/goal/clear",
  turnStart: "turn/start",
  turnSteer: "turn/steer",
  skillsConfigure: "skills/configure",
  sessionsList: "sessions/list",
  sessionsRead: "sessions/read",
} as const;

const sessionConstructionFields = {
  threadId: z.string().min(1),
  cwd: z.string().min(1),
  options: bridgeExecutionOptionsSchema,
  dynamicTools: z.array(dynamicToolSchema).optional(),
  disallowedTools: z.array(z.string().min(1)).optional(),
  instructionMode: instructionModeSchema,
};

export const modelListParamsSchema = z
  .object({
    cwd: z.string().min(1).optional(),
    envVars: z.record(z.string(), z.string()).optional(),
    selectedModel: z.string().min(1).optional(),
  })
  .passthrough();

export const commandListParamsSchema = z
  .object({ cwd: z.string().min(1) })
  .passthrough();

export const commandListResultSchema = threadProviderCommandsStateSchema;
export type CommandListResult = z.infer<typeof commandListResultSchema>;

export const threadStartParamsSchema = z
  .object({
    ...sessionConstructionFields,
    input: z.array(promptInputSchema).optional(),
  })
  .passthrough();

export const threadResumeParamsSchema = z
  .object({
    ...sessionConstructionFields,
    providerThreadId: z.string().min(1),
  })
  .passthrough();

export const threadForkParamsSchema = z
  .object({
    ...sessionConstructionFields,
    sourceProviderThreadId: z.string().min(1),
    sourceProviderCheckpointId: z.string().min(1).optional(),
  })
  .passthrough();

export const threadStopParamsSchema = z
  .object({
    threadId: z.string().min(1),
    providerThreadId: z.string().min(1),
    intent: z.enum(["interrupt", "release"]),
    activeTurnId: z.string().min(1).nullable(),
  })
  .passthrough();

const threadRefParams = z
  .object({
    threadId: z.string().min(1),
    providerThreadId: z.string().min(1),
  })
  .passthrough();

export const threadDiscardParamsSchema = threadRefParams;
export const threadArchiveParamsSchema = threadRefParams;
export const threadUnarchiveParamsSchema = threadRefParams;
export const threadGoalClearParamsSchema = threadRefParams;

export const threadNameSetParamsSchema = z
  .object({
    threadId: z.string().min(1),
    providerThreadId: z.string().min(1),
    title: z.string().min(1),
  })
  .passthrough();

const turnInputFields = {
  threadId: z.string().min(1),
  providerThreadId: z.string().min(1),
  input: z.array(promptInputSchema),
  clientRequestId: clientTurnRequestIdSchema,
  options: bridgeExecutionOptionsSchema,
};

export const turnStartParamsSchema = z.object(turnInputFields).passthrough();

export const turnSteerParamsSchema = z
  .object({
    ...turnInputFields,
    expectedTurnId: z.string().min(1),
  })
  .passthrough();

export const skillsConfigureRootSchema = z
  .object({
    id: z.string().min(1),
    path: z.string().min(1),
    skills: z.array(
      z
        .object({
          name: z.string().min(1),
          description: z.string(),
        })
        .passthrough(),
    ),
  })
  .passthrough();

export type SkillsConfigureRoot = z.infer<typeof skillsConfigureRootSchema>;

export const skillsConfigureParamsSchema = z
  .object({
    roots: z.array(skillsConfigureRootSchema),
  })
  .passthrough();

export const threadIdentityResultSchema = z
  .object({
    providerThreadId: z.string().min(1),
    sessionRestorable: z.boolean().optional(),
  })
  .passthrough();

export const sessionsListParamsSchema = z.object({}).passthrough();

export const providerSessionSummarySchema = z
  .object({
    sessionId: z.string().min(1),
    cwd: z.string().min(1),
    title: z.string(),
    updatedAt: z.number().int().nonnegative(),
    sizeBytes: z.number().int().nonnegative(),
  })
  .passthrough();
export type ProviderSessionSummary = z.infer<
  typeof providerSessionSummarySchema
>;

export const sessionsListResultSchema = z
  .object({ sessions: z.array(providerSessionSummarySchema) })
  .passthrough();
export type SessionsListResult = z.infer<typeof sessionsListResultSchema>;

export const sessionsReadParamsSchema = z
  .object({ sessionId: z.string().min(1) })
  .passthrough();

export const providerSessionStepSchema = z
  .object({
    at: z.number().int().nonnegative(),
    deltas: z.array(threadDeltaSchema),
  })
  .passthrough();
export type ProviderSessionStep = z.infer<typeof providerSessionStepSchema>;

export const providerSessionTurnSchema = z
  .object({
    prompt: z.string(),
    startedAt: z.number().int().nonnegative(),
    steps: z.array(providerSessionStepSchema),
  })
  .passthrough();
export type ProviderSessionTurn = z.infer<typeof providerSessionTurnSchema>;

export const sessionsReadResultSchema = z
  .object({
    sessionId: z.string().min(1),
    cwd: z.string().min(1),
    turns: z.array(providerSessionTurnSchema),
    truncated: z.boolean(),
  })
  .passthrough();
export type SessionsReadResult = z.infer<typeof sessionsReadResultSchema>;
