import { describe, expect, it } from "vitest";
import {
  calculateContextWindowUsagePercent,
  formatUsageCost,
  getContextCompactionDisabledReason,
} from "./thread-context-window-usage";

describe("calculateContextWindowUsagePercent", () => {
  it.each([
    { usedTokens: 1000, modelContextWindow: 10000, expected: 10 },
    { usedTokens: 1234, modelContextWindow: 10000, expected: 12 },
    { usedTokens: 15000, modelContextWindow: 10000, expected: 100 },
    { usedTokens: 1000, modelContextWindow: 0, expected: 0 },
  ])(
    "reports $usedTokens of $modelContextWindow tokens as $expected%",
    ({ usedTokens, modelContextWindow, expected }) => {
      expect(
        calculateContextWindowUsagePercent({
          usedTokens,
          modelContextWindow,
          estimated: false,
        }),
      ).toBe(expected);
    },
  );
});

describe("formatUsageCost", () => {
  it("formats a reported session cost with two decimals", () => {
    expect(formatUsageCost({ amount: 1.5, currency: "USD" })).toMatch(/1\.50/);
  });
});

describe("getContextCompactionDisabledReason", () => {
  it.each([
    { supports: true, status: "idle", requesting: false, expected: null },
    { supports: true, status: "error", requesting: false, expected: null },
    {
      supports: true,
      status: "active",
      requesting: false,
      expected: "Available when the turn finishes",
    },
    {
      supports: true,
      status: "provisioning",
      requesting: false,
      expected: "Available when the turn finishes",
    },
    {
      supports: true,
      status: "idle",
      requesting: true,
      expected: "Compacting",
    },
    {
      supports: false,
      status: "idle",
      requesting: false,
      expected: "This agent can't compact its context",
    },
  ] as const)(
    "supports=$supports status=$status requesting=$requesting gives $expected",
    ({ supports, status, requesting, expected }) => {
      expect(
        getContextCompactionDisabledReason({
          supportsManualCompaction: supports,
          displayStatus: status,
          isRequesting: requesting,
        }),
      ).toBe(expected);
    },
  );
});
