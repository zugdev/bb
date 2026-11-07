import { describe, expect, it } from "vitest";
import { forecastWeekly, shouldStartIdeas, WEEK_MS } from "./forecast.js";

const HOUR = 3_600_000;
const now = Date.parse("2026-11-06T12:00:00Z");
const resetIn = (ms: number) => new Date(now + ms).toISOString();
const policy = { startWithinHours: 48, targetPercent: 90 };

describe("forecastWeekly", () => {
  it("extrapolates the burn rate so far to the reset", () => {
    const forecast = forecastWeekly({ usedPercent: 54, resetsAt: resetIn(73 * HOUR) }, now);
    expect(forecast.remainingMs).toBe(73 * HOUR);
    expect(forecast.projectedPercent).toBeCloseTo(54 + (54 / (95 * HOUR)) * 73 * HOUR);
  });

  it("caps elapsed time at one hour right after a reset", () => {
    const forecast = forecastWeekly({ usedPercent: 2, resetsAt: resetIn(WEEK_MS) }, now);
    expect(forecast.projectedPercent).toBeCloseTo(2 + 2 * 168);
  });

  it("treats a reset in the past as zero time left", () => {
    expect(forecastWeekly({ usedPercent: 40, resetsAt: resetIn(-HOUR) }, now).remainingMs).toBe(0);
  });
});

describe("shouldStartIdeas", () => {
  it("starts in the final window when usage would end under target", () => {
    expect(shouldStartIdeas(forecastWeekly({ usedPercent: 60, resetsAt: resetIn(24 * HOUR) }, now), policy)).toBe(true);
  });

  it("waits until the final window opens", () => {
    expect(shouldStartIdeas(forecastWeekly({ usedPercent: 10, resetsAt: resetIn(72 * HOUR) }, now), policy)).toBe(false);
  });

  it("holds back when the projection reaches the target", () => {
    expect(shouldStartIdeas(forecastWeekly({ usedPercent: 85, resetsAt: resetIn(24 * HOUR) }, now), policy)).toBe(false);
  });

  it("does nothing once the window has reset", () => {
    expect(shouldStartIdeas(forecastWeekly({ usedPercent: 10, resetsAt: resetIn(-HOUR) }, now), policy)).toBe(false);
  });
});
