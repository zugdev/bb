import { useCallback, useEffect, useState } from "react";
import {
  definePluginApp,
  experimental_saveFile,
  useBbNavigate,
  useRpc,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import type { Stall, TurnTrace } from "./logs.js";
import type { PerfStatus, perfRpcContract } from "./server.js";

const LIMIT = 50;

interface PerfData {
  status: PerfStatus;
  turns: TurnTrace[];
  stalls: Stall[];
}

interface WaterfallRow {
  key: string;
  label: string;
  startMs: number;
  endMs: number;
  tone: string;
  detail: string;
}

function waterfallRows(trace: TurnTrace): WaterfallRow[] {
  let previous = 0;
  const spans = trace.spans.map((span) => {
    const row = {
      key: `span:${span.name}`,
      label: span.name,
      startMs: previous,
      endMs: span.atMs,
      tone: "bg-primary",
      detail: `+${(span.atMs - previous).toFixed(1)} ms`,
    };
    previous = span.atMs;
    return row;
  });
  const rpcs = trace.rpcs.map((rpc, index) => ({
    key: `rpc:${index}`,
    label: `rpc ${rpc.type}`,
    startMs: rpc.startMs,
    endMs: rpc.startMs + rpc.durationMs,
    tone: rpc.ok ? "bg-muted-foreground/60" : "bg-destructive",
    detail: `${rpc.durationMs} ms${rpc.ok ? "" : " failed"}`,
  }));
  const sentAt =
    trace.spans.find((span) => span.name === "command.sent")?.atMs ?? 0;
  let daemonPrevious = 0;
  const daemon = trace.daemonSpans.map((span) => {
    const row = {
      key: `daemon:${span.name}`,
      label: `daemon ${span.name}`,
      startMs: sentAt + daemonPrevious,
      endMs: sentAt + span.atMs,
      tone: "bg-primary/50",
      detail: `+${(span.atMs - daemonPrevious).toFixed(1)} ms`,
    };
    daemonPrevious = span.atMs;
    return row;
  });
  return [...spans, ...rpcs, ...daemon];
}

function Waterfall({ trace }: { trace: TurnTrace }) {
  const navigate = useBbNavigate();
  const total = Math.max(trace.totalMs, 1);
  return (
    <section className="space-y-2 rounded-md border border-border p-3">
      <header className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-sm">
        <button
          type="button"
          className="font-mono underline-offset-4 hover:underline"
          onClick={() => navigate.toThread(trace.threadId)}
        >
          {trace.threadId}
        </button>
        <span className="text-muted-foreground">
          {new Date(trace.at).toLocaleString()}
        </span>
        <span className="text-muted-foreground">
          {trace.commandType ?? "not sent"} · {trace.outcome}
        </span>
        <span className="ml-auto font-medium">
          first output{" "}
          {trace.firstOutputMs === null ? "none" : `${trace.firstOutputMs} ms`}
        </span>
      </header>
      <ol className="space-y-0.5">
        {waterfallRows(trace).map((row) => (
          <li
            key={row.key}
            className="grid grid-cols-[14rem_1fr_6rem] items-center gap-2 text-xs"
          >
            <span className="truncate font-mono" title={row.label}>
              {row.label}
            </span>
            <span className="relative h-3 rounded-sm bg-muted">
              <span
                className={`absolute inset-y-0 rounded-sm ${row.tone}`}
                style={{
                  left: `${(row.startMs / total) * 100}%`,
                  width: `max(2px, ${((row.endMs - row.startMs) / total) * 100}%)`,
                }}
              />
            </span>
            <span className="text-right tabular-nums text-muted-foreground">
              {row.detail}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}

function profileUrl(name: string): string {
  return `/api/v1/plugins/perf/http/profile?name=${encodeURIComponent(name)}`;
}

function StallRow({ stall }: { stall: Stall }) {
  const profile = stall.profile;
  return (
    <li className="space-y-1 rounded-md border border-border p-3 text-sm">
      <div className="flex flex-wrap items-baseline gap-x-3">
        <span className="font-medium tabular-nums">{stall.delayMs} ms</span>
        <span className="text-muted-foreground">
          {new Date(stall.startedAt).toLocaleString()}
        </span>
        <span className="text-muted-foreground">
          {stall.kind} · {stall.attribution}
        </span>
        {profile === null ? (
          <span className="ml-auto text-muted-foreground">no profile</span>
        ) : (
          <a
            className="ml-auto underline-offset-4 hover:underline"
            href={profileUrl(profile.name)}
            download={profile.name}
            title={profile.path}
            onClick={(event) => {
              event.preventDefault();
              void experimental_saveFile({
                url: profileUrl(profile.name),
                fileName: profile.name,
              });
            }}
          >
            {profile.name}
          </a>
        )}
      </div>
      {stall.candidate !== null && (
        <p className="font-mono text-xs">{stall.candidate}</p>
      )}
      {stall.inFlightWork !== null && (
        <p className="truncate font-mono text-xs text-muted-foreground">
          in flight: {stall.inFlightWork}
        </p>
      )}
      {stall.stacks.slice(0, 3).map((stack, index) => {
        const top = stack.frames[0];
        return top === undefined ? null : (
          <p key={index} className="truncate font-mono text-xs">
            {stack.sampledMs} ms {top.functionName}{" "}
            <span className="text-muted-foreground">
              {top.url}:{top.lineNumber}
            </span>
          </p>
        );
      })}
    </li>
  );
}

function StatusLine({ status }: { status: PerfStatus }) {
  const sample = status.latestSample;
  return (
    <div className="space-y-1 text-sm">
      <p>
        {status.collecting
          ? "Diagnostics are collecting."
          : status.diagnosticsAvailable === false
            ? "Diagnostics are off. Start bb with BB_PERF_DIAGNOSTICS=1, then turn on the performanceDiagnostics experiment."
            : "Diagnostics are off. Turn on the performanceDiagnostics experiment in Settings → Experiments."}
      </p>
      {sample !== null && (
        <p className="text-muted-foreground tabular-nums">
          Latest sample {new Date(sample.at).toLocaleTimeString()}: loop delay
          p99 {sample.p99DelayMs.toFixed(1)} ms, max{" "}
          {sample.maxDelayMs.toFixed(1)} ms, ELU{" "}
          {sample.eventLoopUtilization.toFixed(2)}
        </p>
      )}
      <p className="font-mono text-xs text-muted-foreground">
        {status.logsDir} · {status.profiles.count} profiles
      </p>
    </div>
  );
}

function PerfPage() {
  const rpc = useRpc<typeof perfRpcContract>();
  const [data, setData] = useState<PerfData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    Promise.all([
      rpc.call("status"),
      rpc.call("turns", { threadId: null, limit: LIMIT }),
      rpc.call("stalls", { limit: LIMIT }),
    ]).then(
      ([status, turns, stalls]) => {
        setData({ status, turns, stalls });
        setError(null);
        setLoading(false);
      },
      (loadError: unknown) => {
        setError(
          loadError instanceof Error ? loadError.message : String(loadError),
        );
        setLoading(false);
      },
    );
  }, [rpc]);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <div className="h-full overflow-y-auto p-4 md:p-5">
      <div className="mx-auto w-full max-w-4xl space-y-6">
        <div className="flex items-start gap-4">
          <div className="flex-1">
            {data !== null && <StatusLine status={data.status} />}
            {error !== null && (
              <p className="text-sm text-destructive" role="alert">
                {error}
              </p>
            )}
          </div>
          <Button
            variant="outline"
            size="sm"
            disabled={loading}
            onClick={() => {
              setLoading(true);
              load();
            }}
          >
            {loading ? "Loading…" : "Refresh"}
          </Button>
        </div>
        <section className="space-y-3">
          <h2 className="text-base font-medium">Turn traces</h2>
          {data?.turns.length === 0 && (
            <p className="text-sm text-muted-foreground">No turn traces yet.</p>
          )}
          {data?.turns.map((trace) => (
            <Waterfall key={`${trace.at}:${trace.threadId}`} trace={trace} />
          ))}
        </section>
        <section className="space-y-3">
          <h2 className="text-base font-medium">Event loop stalls</h2>
          {data?.stalls.length === 0 && (
            <p className="text-sm text-muted-foreground">No stalls logged.</p>
          )}
          <ul className="space-y-2">
            {data?.stalls.map((stall) => (
              <StallRow
                key={`${stall.kind}:${stall.startedAt}`}
                stall={stall}
              />
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.navPanel({
    id: "perf",
    title: "Performance",
    icon: "ChartColumn",
    path: "perf",
    component: PerfPage,
  });
});
