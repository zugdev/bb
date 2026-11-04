import { canCompactBeforeSend } from "@bb/client-core";
import type { ThreadRuntimeDisplayStatus } from "@bb/domain";
import type { ThreadContextWindowUsage } from "@bb/server-contract";

const TOKEN_COMPACT_FORMATTER = new Intl.NumberFormat("en-US", {
  notation: "compact",
  maximumFractionDigits: 0,
});

export function calculateContextWindowUsagePercent(
  usage: ThreadContextWindowUsage,
): number {
  if (usage.modelContextWindow <= 0) return 0;
  const ratio = usage.usedTokens / usage.modelContextWindow;
  const clampedRatio = Math.min(Math.max(ratio, 0), 1);
  return Math.round(clampedRatio * 100);
}

export function formatCompactTokenCount(value: number): string {
  const safeValue = Math.max(0, Math.round(value));
  return TOKEN_COMPACT_FORMATTER.format(safeValue).toLowerCase();
}

export function formatUsageCost(cost: {
  amount: number;
  currency: string;
}): string {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: cost.currency,
      minimumFractionDigits: 2,
      maximumFractionDigits: cost.amount < 1 ? 4 : 2,
    }).format(cost.amount);
  } catch {
    return `${cost.amount} ${cost.currency}`;
  }
}

export function getContextCompactionDisabledReason(args: {
  supportsManualCompaction: boolean;
  displayStatus: ThreadRuntimeDisplayStatus;
  isRequesting: boolean;
}): string | null {
  if (!args.supportsManualCompaction) {
    return "This agent can't compact its context";
  }
  if (args.isRequesting) return "Compacting";
  if (!canCompactBeforeSend(args.displayStatus)) {
    return "Available when the turn finishes";
  }
  return null;
}
