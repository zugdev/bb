import { expect, it } from "vitest";
import { usageWindowReset } from "./usage-resets.js";

const now = Date.parse("2026-11-03T13:05:00.000Z");
const rolled = { usedPercent: 2, resetsAt: "2026-11-03T18:00:00.000Z" };

it("notifies only when a nearly exhausted window rolls over", () => {
  expect(usageWindowReset(undefined, rolled, now)).toBe(false);
  expect(
    usageWindowReset(
      { usedPercent: 89, resetsAt: "2026-11-03T13:00:00.000Z" },
      rolled,
      now,
    ),
  ).toBe(false);
  expect(
    usageWindowReset(
      { usedPercent: 95, resetsAt: "2026-11-03T13:00:00.000Z" },
      rolled,
      now,
    ),
  ).toBe(true);
  expect(
    usageWindowReset(
      { usedPercent: 95, resetsAt: rolled.resetsAt },
      { usedPercent: 97, resetsAt: rolled.resetsAt },
      now,
    ),
  ).toBe(false);
});

it("ignores a later reset time reported before the previous reset passed", () => {
  expect(
    usageWindowReset(
      { usedPercent: 95, resetsAt: "2026-11-03T14:00:00.000Z" },
      { usedPercent: 96, resetsAt: "2026-11-03T14:00:01.000Z" },
      now,
    ),
  ).toBe(false);
});
