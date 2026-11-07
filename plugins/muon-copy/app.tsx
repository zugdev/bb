import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import {
  definePluginApp,
  useRpc,
  type ExperimentalCodeFenceRendererProps,
} from "@get-bb/plugin-sdk/app";
import { blockSchema, type FileKind } from "./block";
import type { muonCopyRpcContract } from "./server.js";

const COPIED_MS = 1_500;

type CopyState =
  | { status: "idle" }
  | { status: "copied" }
  | { status: "error"; message: string };

const LABELS: Record<FileKind, string> = {
  instruction: "Copy instruction",
  survey: "Copy survey answer",
  review: "Copy review response",
};

async function writeClipboard(text: Promise<string>): Promise<void> {
  if (typeof ClipboardItem === "undefined") {
    await navigator.clipboard.writeText(await text);
    return;
  }
  const blob = text.then((value) => new Blob([value], { type: "text/plain" }));
  await navigator.clipboard.write([new ClipboardItem({ "text/plain": blob })]);
}

function CopyButton({ task, file }: { task: string; file: FileKind }) {
  const rpc = useRpc<typeof muonCopyRpcContract>();
  const [state, setState] = useState<CopyState>({ status: "idle" });
  useEffect(() => {
    if (state.status !== "copied") return;
    const timer = window.setTimeout(() => setState({ status: "idle" }), COPIED_MS);
    return () => window.clearTimeout(timer);
  }, [state]);

  const copy = () => {
    const text = rpc.call("read", { task, file }).then((result) => {
      if (result.kind === "missing") throw new Error(`File not found: ${result.path}`);
      return result.text;
    });
    writeClipboard(text).then(
      () => setState({ status: "copied" }),
      (error: unknown) =>
        setState({
          status: "error",
          message: error instanceof Error ? error.message : String(error),
        }),
    );
  };

  return (
    <div className="flex min-w-0 flex-col gap-1">
      <button
        type="button"
        onClick={copy}
        className="inline-flex cursor-pointer items-center gap-1.5 rounded-md border border-border bg-background px-2.5 py-1 text-sm text-foreground transition-colors hover:bg-state-hover focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
      >
        <Icon
          name={state.status === "copied" ? "Check" : "Copy"}
          aria-hidden
          className="size-3.5"
        />
        {state.status === "copied" ? "Copied" : LABELS[file]}
      </button>
      {state.status === "error" ? (
        <span role="alert" className="text-xs text-destructive">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

function ReviewButton({ task }: { task: string }) {
  const rpc = useRpc<typeof muonCopyRpcContract>();
  const [exists, setExists] = useState(false);
  useEffect(() => {
    let live = true;
    rpc.call("read", { task, file: "review" }).then(
      (result) => live && setExists(result.kind === "ok"),
      () => live && setExists(false),
    );
    return () => {
      live = false;
    };
  }, [rpc, task]);
  return exists ? <CopyButton task={task} file="review" /> : null;
}

function MuonCopyFence({ code, status, Original }: ExperimentalCodeFenceRendererProps) {
  if (status !== "closed") return <Original />;
  let parsed: unknown;
  try {
    parsed = JSON.parse(code);
  } catch {
    parsed = null;
  }
  const block = blockSchema.safeParse(parsed);
  if (!block.success) {
    return (
      <>
        <div role="alert" className="my-2 text-sm text-destructive">
          muon-copy expects {'{"task":"<id>"}'} with a task id matching
          [A-Za-z0-9_.-]+
        </div>
        <Original />
      </>
    );
  }
  return (
    <section
      aria-label={`Muon task ${block.data.task}`}
      className="my-2 flex flex-wrap items-start gap-2 rounded-lg border border-border px-3 py-2"
    >
      <span className="self-center font-mono text-xs text-muted-foreground">
        {block.data.task}
      </span>
      <CopyButton task={block.data.task} file="instruction" />
      <CopyButton task={block.data.task} file="survey" />
      <ReviewButton task={block.data.task} />
    </section>
  );
}

export default definePluginApp((app) => {
  app.slots.experimental_codeFenceRenderer({
    id: "muon-copy",
    languages: ["muon-copy"],
    component: MuonCopyFence,
  });
});
