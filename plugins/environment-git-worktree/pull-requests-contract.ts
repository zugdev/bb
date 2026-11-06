import { defineRpcContract } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { GIT_WORKTREE_ENVIRONMENT_PROVIDER_ID } from "./provider-id.js";

export const GIT_WORKTREE_PLUGIN_ID = "environment-git-worktree";

export const openPullRequestSchema = z
  .object({
    number: z.number().int(),
    title: z.string(),
    headRefName: z.string().min(1),
    isDraft: z.boolean(),
  })
  .strict();
export type OpenPullRequest = z.infer<typeof openPullRequestSchema>;

const projectPullRequestSchema = openPullRequestSchema
  .extend({ worktreePath: z.string().min(1).nullable() })
  .strict();
export type ProjectPullRequest = z.infer<typeof projectPullRequestSchema>;

export const worktreePullRequestsRpcContract = defineRpcContract({
  listOpenPullRequests: {
    experimental_description:
      "Your open pull requests in a project, with the adoptable worktree that has each head branch checked out.",
    input: z
      .object({
        projectId: z.string().min(1),
        hostId: z.string().min(1).nullable(),
      })
      .strict(),
    output: z
      .object({
        hostId: z.string().min(1).nullable(),
        pullRequests: z.array(projectPullRequestSchema),
      })
      .strict(),
  },
});

export type PullRequestWorktreeInputs =
  | { kind: "existing"; path: string }
  | { branch: { kind: "named"; name: string } };

export function pullRequestInputs(
  pr: ProjectPullRequest,
): PullRequestWorktreeInputs {
  return pr.worktreePath === null
    ? { branch: { kind: "named", name: pr.headRefName } }
    : { kind: "existing", path: pr.worktreePath };
}

export function pullRequestEnvironment(hostId: string, pr: ProjectPullRequest) {
  return {
    type: "provider" as const,
    environmentProviderId: GIT_WORKTREE_ENVIRONMENT_PROVIDER_ID,
    machine: { type: "existing" as const, hostId },
    inputs: pullRequestInputs(pr),
  };
}
