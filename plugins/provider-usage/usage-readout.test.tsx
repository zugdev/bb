import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { installTestPluginRuntime } from "@get-bb/plugin-sdk/testing/app";
import { UsageReadout, weeklyReadings } from "./usage-readout.js";
import type { ProviderUsage, UsageProvider } from "./usage-schema.js";

installTestPluginRuntime();

function provider(providerId: string, usage: ProviderUsage): UsageProvider {
  return {
    id: `source:${providerId}`,
    providerId,
    accountLabel: null,
    displayName: providerId,
    logoUrl: null,
    icon: null,
    strings: { iconTint: null },
    signInHint: "Sign in.",
    expiredHint: "Expired.",
    usage,
  };
}

function windows(fiveHour: number, weekly: number): ProviderUsage {
  return {
    status: "ok",
    accountEmail: null,
    planLabel: null,
    windows: [
      { label: "Five-hour limit", usedPercent: fiveHour, resetsAt: null, cost: null },
      { label: "Weekly · Opus", usedPercent: 99, resetsAt: null, cost: null },
      { label: "Weekly limit", usedPercent: weekly, resetsAt: null, cost: null },
    ],
  };
}

function machine(providers: UsageProvider[]) {
  return {
    id: "host-1",
    displayName: "Laptop",
    status: "connected" as const,
    providers,
    error: null,
  };
}

describe("weeklyReadings", () => {
  it("reads only the Claude and Codex weekly windows, Claude first", () => {
    const readings = weeklyReadings(
      machine([
        provider("codex", windows(5, 17.4)),
        provider("opencode", windows(1, 50)),
        provider("claude-code", windows(80, 42)),
      ]),
    );
    expect(
      readings.map((reading) => [reading.provider.providerId, reading.usedPercent]),
    ).toEqual([
      ["claude-code", 42],
      ["codex", 17.4],
    ]);
  });

  it("leaves out a provider that isn't signed in", () => {
    const readings = weeklyReadings(
      machine([
        provider("claude-code", { status: "unauthenticated" }),
        provider("codex", windows(5, 17)),
      ]),
    );
    expect(readings.map((reading) => reading.provider.providerId)).toEqual([
      "codex",
    ]);
  });
});

describe("UsageReadout", () => {
  it("shows rounded percentages next to each provider icon", () => {
    const html = renderToStaticMarkup(
      <UsageReadout
        readings={weeklyReadings(
          machine([
            provider("claude-code", windows(80, 42)),
            provider("codex", windows(5, 17.4)),
          ]),
        )}
      />,
    );
    expect(html).toContain("42%");
    expect(html).toContain("17%");
    expect(html).not.toContain("80%");
  });

  it("falls back to the usage icon when nothing is signed in", () => {
    const html = renderToStaticMarkup(<UsageReadout readings={[]} />);
    expect(html).not.toContain("data-provider-usage-readout");
  });
});
