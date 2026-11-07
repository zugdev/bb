import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { OpenPullRequest, PullRequestChecks } from "../contract.js";

const execFileAsync = promisify(execFile);
const GH_TIMEOUT_MS = 15_000;

const ghPullRequestListSchema = z.array(
  z.object({
    number: z.number().int(),
    title: z.string(),
    headRefName: z.string().min(1),
    isDraft: z.boolean(),
    isCrossRepository: z.boolean(),
    statusCheckRollup: z
      .array(
        z.object({
          status: z.string().optional(),
          conclusion: z.string().nullable().optional(),
          state: z.string().optional(),
        }),
      )
      .nullish(),
  }),
);

const FAILED = new Set([
  "FAILURE",
  "ERROR",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
]);
const RUNNING = new Set(["PENDING", "EXPECTED"]);

export function summarizeChecks(
  rollup: ReadonlyArray<{
    status?: string;
    conclusion?: string | null;
    state?: string;
  }> | null,
): PullRequestChecks {
  if (rollup === null || rollup.length === 0) return "none";
  const results = rollup.map((check) =>
    check.state ??
    (check.status === "COMPLETED" ? (check.conclusion ?? "") : "PENDING"),
  );
  if (results.some((result) => FAILED.has(result))) return "failing";
  if (results.some((result) => RUNNING.has(result))) return "running";
  return "passing";
}

export function parseOpenPullRequests(stdout: string): OpenPullRequest[] {
  return ghPullRequestListSchema
    .parse(JSON.parse(stdout))
    .filter((pr) => !pr.isCrossRepository)
    .map(({ number, title, headRefName, isDraft, statusCheckRollup }) => ({
      number,
      title,
      headRefName,
      isDraft,
      checks: summarizeChecks(statusCheckRollup ?? null),
    }));
}

export async function listOpenPullRequests(
  sourcePath: string,
): Promise<OpenPullRequest[]> {
  const { stdout } = await execFileAsync(
    "gh",
    [
      "pr",
      "list",
      "--author",
      "@me",
      "--state",
      "open",
      "--limit",
      "50",
      "--json",
      "number,title,headRefName,isDraft,isCrossRepository,statusCheckRollup",
    ],
    { cwd: sourcePath, timeout: GH_TIMEOUT_MS },
  );
  return parseOpenPullRequests(stdout);
}
