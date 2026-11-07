import { describe, expect, it } from "vitest";
import { projectedUsagePercent } from "./usage-format.js";

const NOW = Date.parse("2026-11-06T12:00:00Z");
const HOUR = 3_600_000;
const resetIn = (ms: number) => new Date(NOW + ms).toISOString();

describe("projectedUsagePercent", () => {
  it("extrapolates the weekly burn rate to the reset", () => {
    expect(
      projectedUsagePercent(
        { label: "Weekly limit", usedPercent: 40, resetsAt: resetIn(84 * HOUR) },
        NOW,
      ),
    ).toBeCloseTo(80);
  });

  it("uses the five-hour window length for five-hour limits", () => {
    expect(
      projectedUsagePercent(
        { label: "Five-hour limit", usedPercent: 30, resetsAt: resetIn(2 * HOUR) },
        NOW,
      ),
    ).toBeCloseTo(50);
  });

  it("projects model windows such as Weekly · Fable", () => {
    expect(
      projectedUsagePercent(
        { label: "Weekly · Fable", usedPercent: 3, resetsAt: resetIn(84 * HOUR) },
        NOW,
      ),
    ).toBeCloseTo(6);
  });

  it("floors elapsed time so a fresh window doesn't project wildly", () => {
    expect(
      projectedUsagePercent(
        { label: "Weekly limit", usedPercent: 2, resetsAt: resetIn(168 * HOUR) },
        NOW,
      ),
    ).toBeCloseTo(2 + 2 * 20);
  });

  it("returns null without a known window length or reset", () => {
    expect(
      projectedUsagePercent({ label: "Monthly", usedPercent: 10, resetsAt: resetIn(HOUR) }, NOW),
    ).toBeNull();
    expect(
      projectedUsagePercent({ label: "Weekly limit", usedPercent: 10, resetsAt: null }, NOW),
    ).toBeNull();
  });
});
