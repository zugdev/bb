import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";

const commitSchema = z.object({ sha: z.string(), subject: z.string() }).strict();

export const updateStepSchema = z.enum([
  "fast-forward",
  "install",
  "package",
  "swap",
  "swap-and-reopen",
]);
export type UpdateStep = z.infer<typeof updateStepSchema>;

export const forkUpdaterHostContract = defineRpcContract({
  inspect: {
    input: z
      .object({ checkoutPath: z.string().min(1), builtCommit: z.string().min(1) })
      .strict(),
    output: z
      .object({
        remoteCommit: z.string(),
        builtIsAncestor: z.boolean(),
        commits: z.array(commitSchema),
        changedFiles: z.array(z.string()),
        forkPluginDirs: z.array(z.string()),
        installedCommit: z.string().nullable(),
        swapError: z.string().nullable(),
      })
      .strict(),
  },
  run: {
    input: z
      .object({ checkoutPath: z.string().min(1), step: updateStepSchema })
      .strict(),
    output: z.object({ headCommit: z.string() }).strict(),
  },
});

export const statusSchema = z
  .object({
    checkoutPath: z.string(),
    builtCommit: z.string(),
    remoteCommit: z.string().nullable(),
    commits: z.array(commitSchema),
    kind: z.enum(["up-to-date", "plugins", "rebuild"]),
    reloadPluginIds: z.array(z.string()),
    installPluginDirs: z.array(z.string()),
    checkedAt: z.number().nullable(),
    progress: z.string().nullable(),
    error: z.string().nullable(),
  })
  .strict();
export type ForkUpdaterStatus = z.infer<typeof statusSchema>;

export const forkUpdaterRpcContract = defineRpcContract({
  status: {
    input: z.object({ refresh: z.boolean() }).strict(),
    output: statusSchema,
  },
  update: {
    input: z.object({ reopen: z.boolean() }).strict(),
    output: statusSchema,
  },
});
