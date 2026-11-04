import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

export const MAX_SCOPED_THREADS = 50;

export const orchestratorScopeSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("project"), projectId: z.string().min(1) }).strict(),
  z
    .object({
      kind: z.literal("threads"),
      threadIds: z.array(z.string().min(1)).min(1).max(MAX_SCOPED_THREADS),
    })
    .strict(),
]);

export type OrchestratorScope = z.infer<typeof orchestratorScopeSchema>;

export const orchestratorRpcContract = defineRpcContract({
  "orchestrator.start": {
    input: orchestratorScopeSchema,
    output: z.object({ threadId: z.string() }).strict(),
  },
});
