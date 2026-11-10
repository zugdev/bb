import { useMemo, useState } from "react";
import {
  definePluginApp,
  useBbNavigate,
  type BbNavigate,
  type PluginPendingInteractionProps,
} from "@get-bb/plugin-sdk/app";
import { Button } from "@/components/ui/button";
import Loading03Icon from "@hugeicons/core-free-icons/Loading03Icon";
import { HugeiconsIcon } from "@hugeicons/react";
import {
  COMMAND_REQUEST_RENDERER_ID,
  commandRequestPayloadSchema,
} from "./src/command-request.js";

async function openWhenCreated(navigate: BbNavigate, terminalId: string) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (await navigate.experimental_openTerminal({ terminalId }).catch(() => false))
      return;
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
}

function CommandRequestInteraction({
  interaction,
  submit,
  cancel,
}: PluginPendingInteractionProps) {
  const navigate = useBbNavigate();
  const parsed = useMemo(
    () => commandRequestPayloadSchema.safeParse(interaction.payload),
    [interaction.payload],
  );
  const [pendingAction, setPendingAction] = useState<"run" | "decline" | null>(
    null,
  );
  const busy = pendingAction !== null;

  const decline = async () => {
    setPendingAction("decline");
    try {
      await cancel();
    } catch {
      setPendingAction(null);
    }
  };

  if (!parsed.success) {
    return (
      <div className="space-y-3">
        <p className="text-sm text-muted-foreground">
          This command request is invalid and cannot run.
        </p>
        <Button variant="outline" disabled={busy} onClick={() => void decline()}>
          Dismiss
        </Button>
      </div>
    );
  }
  const payload = parsed.data;

  const run = async () => {
    setPendingAction("run");
    try {
      await submit({ action: "run" });
    } catch {
      setPendingAction(null);
      return;
    }
    void openWhenCreated(navigate, payload.terminalId);
  };

  return (
    <div className="@container/command space-y-4">
      <div className="space-y-2">
        {payload.purpose ? (
          <p className="text-pretty text-sm leading-relaxed text-foreground">
            {payload.purpose}
          </p>
        ) : null}
        <pre
          className="max-h-64 overflow-auto whitespace-pre-wrap break-all rounded-md bg-surface-raised px-2.5 py-2 font-mono text-xs text-foreground"
          translate="no"
        >
          {payload.command}
        </pre>
        <p className="text-xs text-muted-foreground">
          Runs in a new terminal in this thread's workspace when you click Run.
        </p>
      </div>
      <div className="flex flex-col-reverse gap-2 @min-[24rem]/command:flex-row @min-[24rem]/command:justify-end">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void decline()}
        >
          Decline
        </Button>
        <Button
          type="button"
          size="sm"
          disabled={busy}
          onClick={() => void run()}
        >
          {pendingAction === "run" ? (
            <HugeiconsIcon
              icon={Loading03Icon}
              className="size-3 animate-spin"
              aria-hidden="true"
            />
          ) : null}
          Run
        </Button>
      </div>
    </div>
  );
}

export default definePluginApp((app) => {
  app.slots.pendingInteraction({
    id: COMMAND_REQUEST_RENDERER_ID,
    component: CommandRequestInteraction,
  });
});
