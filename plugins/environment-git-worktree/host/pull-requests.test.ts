import { describe, expect, it } from "vitest";
import { parseOpenPullRequests, summarizeChecks } from "./pull-requests.js";

describe("parseOpenPullRequests", () => {
  it("drops pull requests from forks because their head branch is not in origin", () => {
    const stdout = JSON.stringify([
      {
        number: 7,
        title: "Own branch",
        headRefName: "feature",
        isDraft: true,
        isCrossRepository: false,
        statusCheckRollup: [],
      },
      {
        number: 8,
        title: "From a fork",
        headRefName: "main",
        isDraft: false,
        isCrossRepository: true,
      },
    ]);
    expect(parseOpenPullRequests(stdout)).toEqual([
      {
        number: 7,
        title: "Own branch",
        headRefName: "feature",
        isDraft: true,
        checks: "none",
      },
    ]);
  });

  it("rejects output without a head branch", () => {
    const stdout = JSON.stringify([
      { number: 1, title: "x", isDraft: false, isCrossRepository: false },
    ]);
    expect(() => parseOpenPullRequests(stdout)).toThrow();
  });
});

describe("summarizeChecks", () => {
  const passed = { status: "COMPLETED", conclusion: "SUCCESS" };
  const skipped = { status: "COMPLETED", conclusion: "SKIPPED" };
  const running = { status: "IN_PROGRESS", conclusion: "" };
  const failed = { status: "COMPLETED", conclusion: "FAILURE" };
  it.each([
    ["no rollup", null, "none"],
    ["no checks", [], "none"],
    ["finished checks", [passed, skipped], "passing"],
    ["a check still running", [passed, running], "running"],
    ["a pending commit status", [passed, { state: "PENDING" }], "running"],
    ["a failure while others run", [running, failed], "failing"],
    ["a failed commit status", [passed, { state: "ERROR" }], "failing"],
  ] as const)("reports %s", (_label, rollup, expected) => {
    expect(summarizeChecks(rollup)).toBe(expected);
  });
});
