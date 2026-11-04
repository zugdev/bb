import { z } from "zod";

export const RESET_NOTIFICATION_PERCENT = 90;

export const notificationOutputSchema = z.object({ ok: z.literal(true) });

export interface UsageReading {
  usedPercent: number;
  resetsAt: string | null;
}

export function usageWindowReset(
  previous: UsageReading | undefined,
  current: UsageReading,
  now: number,
): boolean {
  if (
    previous === undefined ||
    previous.usedPercent < RESET_NOTIFICATION_PERCENT ||
    previous.resetsAt === null ||
    current.resetsAt === null
  )
    return false;
  const previousReset = Date.parse(previous.resetsAt);
  return previousReset <= now && Date.parse(current.resetsAt) > previousReset;
}
