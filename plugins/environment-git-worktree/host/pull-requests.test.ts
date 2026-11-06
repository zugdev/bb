import { describe, expect, it } from "vitest";
import { parseOpenPullRequests } from "./pull-requests.js";

describe("parseOpenPullRequests", () => {
  it("drops pull requests from forks because their head branch is not in origin", () => {
    const stdout = JSON.stringify([
      {
        number: 7,
        title: "Own branch",
        headRefName: "feature",
        isDraft: true,
        isCrossRepository: false,
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
      { number: 7, title: "Own branch", headRefName: "feature", isDraft: true },
    ]);
  });

  it("rejects output without a head branch", () => {
    const stdout = JSON.stringify([
      { number: 1, title: "x", isDraft: false, isCrossRepository: false },
    ]);
    expect(() => parseOpenPullRequests(stdout)).toThrow();
  });
});
