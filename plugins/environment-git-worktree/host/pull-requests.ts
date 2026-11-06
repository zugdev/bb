import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";
import type { OpenPullRequest } from "../contract.js";

const execFileAsync = promisify(execFile);
const GH_TIMEOUT_MS = 15_000;

const ghPullRequestListSchema = z.array(
  z.object({
    number: z.number().int(),
    title: z.string(),
    headRefName: z.string().min(1),
    isDraft: z.boolean(),
    isCrossRepository: z.boolean(),
  }),
);

export function parseOpenPullRequests(stdout: string): OpenPullRequest[] {
  return ghPullRequestListSchema
    .parse(JSON.parse(stdout))
    .filter((pr) => !pr.isCrossRepository)
    .map(({ number, title, headRefName, isDraft }) => ({
      number,
      title,
      headRefName,
      isDraft,
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
      "number,title,headRefName,isDraft,isCrossRepository",
    ],
    { cwd: sourcePath, timeout: GH_TIMEOUT_MS },
  );
  return parseOpenPullRequests(stdout);
}
