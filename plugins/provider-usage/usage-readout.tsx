import { experimental_ProviderIcon as ProviderIcon } from "@get-bb/plugin-sdk/app";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import type { UsageMachine, UsageProvider } from "./usage-schema.js";

export const READOUT_PROVIDER_IDS = ["claude-code", "codex"];
const WEEKLY_WINDOW_LABEL = "Weekly limit";

export interface WeeklyReading {
  provider: UsageProvider;
  usedPercent: number;
}

export function weeklyReadings(machine: UsageMachine | null): WeeklyReading[] {
  return READOUT_PROVIDER_IDS.flatMap((providerId) => {
    for (const provider of machine?.providers ?? []) {
      if (provider.providerId !== providerId) continue;
      if (provider.usage?.status !== "ok") continue;
      const window = provider.usage.windows.find(
        (candidate) => candidate.label === WEEKLY_WINDOW_LABEL,
      );
      if (window !== undefined)
        return [{ provider, usedPercent: window.usedPercent }];
    }
    return [];
  });
}

function readingToneClass(usedPercent: number): string | null {
  if (usedPercent >= 95) return "text-destructive";
  if (usedPercent >= 80) return "text-warning";
  return null;
}

export function UsageReadout({ readings }: { readings: WeeklyReading[] }) {
  if (readings.length === 0)
    return (
      <Icon name="ChartColumn" className="size-4 shrink-0" aria-hidden="true" />
    );
  return (
    <span
      data-provider-usage-readout=""
      className="flex items-center gap-1.5 text-2xs tabular-nums"
    >
      {readings.map(({ provider, usedPercent }) => (
        <span
          key={provider.providerId}
          className={cn(
            "flex items-center gap-0.5",
            readingToneClass(usedPercent),
          )}
        >
          <ProviderIcon
            providerKind="agent"
            provider={{ ...provider, id: provider.providerId }}
            fallback="Bot"
            className="size-3.5 shrink-0"
            aria-hidden="true"
          />
          {Math.round(usedPercent)}%
        </span>
      ))}
    </span>
  );
}
