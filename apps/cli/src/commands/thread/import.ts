import { Command } from "commander";
import type { HostProviderSession } from "@bb/server-contract";
import { action } from "../../action.js";
import { createCliBbSdk } from "../../client.js";
import { resolveLocalHostId } from "../../daemon.js";
import { columnWidths, printBorderlessTable } from "../../table.js";
import { outputJson, prependErrorContext } from "../helpers.js";
import {
  resolveMachineHostId,
  resolveMachineTargetOption,
} from "../machine.js";

interface ThreadImportCommandOptions {
  all?: boolean;
  host?: string;
  json?: boolean;
  list?: boolean;
  machine?: string;
  project?: string;
  provider?: string;
}

const TITLE_COLUMN_MAX = 60;

async function resolveImportHostId(
  opts: ThreadImportCommandOptions,
  serverUrl: string,
): Promise<string> {
  const machineTarget = resolveMachineTargetOption(opts);
  return machineTarget
    ? resolveMachineHostId({
        requireConnected: true,
        serverUrl,
        target: machineTarget,
      })
    : resolveLocalHostId();
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function printSessionTable(sessions: HostProviderSession[]): void {
  const head = ["SESSION", "UPDATED", "SIZE", "CWD", "TITLE", "THREAD"];
  const rows = sessions.map((session) => [
    session.sessionId,
    new Date(session.updatedAt).toISOString().slice(0, 16).replace("T", " "),
    formatSize(session.sizeBytes),
    session.projectId === null ? `${session.cwd} (no project)` : session.cwd,
    truncate(session.title, TITLE_COLUMN_MAX),
    session.importedThreadId ?? "-",
  ]);
  printBorderlessTable(
    {
      head,
      colWidths: columnWidths([head, ...rows], [4, 4, 4, 4, 4, 4]),
      trimTrailingWhitespace: true,
    },
    rows,
  );
}

interface SessionImportOutcome {
  sessionId: string;
  threadId: string | null;
  error: string | null;
}

export async function importAllSessions(
  sessions: HostProviderSession[],
  importSession: (session: HostProviderSession) => Promise<{ id: string }>,
  opts: ThreadImportCommandOptions,
): Promise<void> {
  const outcomes: SessionImportOutcome[] = [];
  for (const session of sessions) {
    try {
      const thread = await importSession(session);
      outcomes.push({
        sessionId: session.sessionId,
        threadId: thread.id,
        error: null,
      });
      if (opts.json !== true) {
        console.log(`Imported ${session.sessionId} as ${thread.id}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      outcomes.push({
        sessionId: session.sessionId,
        threadId: null,
        error: message,
      });
      if (opts.json !== true) {
        console.error(`Failed ${session.sessionId}: ${message}`);
      }
    }
  }
  const failed = outcomes.filter((outcome) => outcome.error !== null).length;
  if (failed > 0) process.exitCode = 1;
  if (outputJson(opts, { outcomes })) return;
  console.log(
    `Imported ${outcomes.length - failed} of ${outcomes.length} sessions`,
  );
}

export function registerImportCommand(
  parent: Command,
  getUrl: () => string,
): void {
  parent
    .command("import [session-id]")
    .description(
      "Import a Claude Code session from a machine as a thread, or list importable sessions",
    )
    .option("--list", "List the sessions recorded on the machine")
    .option(
      "--all",
      "Import every session that belongs to a project and has no thread yet",
    )
    .option(
      "--project <id>",
      "With --list or --all, only that project's sessions",
    )
    .option("--machine <id-or-name>", "Machine that recorded the session")
    .option("--host <id-or-name>", "Alias for --machine")
    .option("--provider <id>", "Provider that recorded the session")
    .option("--json", "Print machine-readable JSON output")
    .action(
      action(
        async (
          sessionId: string | undefined,
          opts: ThreadImportCommandOptions,
        ) => {
          const serverUrl = getUrl();
          const sdk = createCliBbSdk(serverUrl);
          const hostId = await resolveImportHostId(opts, serverUrl);
          const providerOption =
            opts.provider === undefined ? {} : { providerId: opts.provider };
          if (opts.list === true || opts.all === true) {
            const result = await sdk.hosts.experimental_listProviderSessions({
              hostId,
              ...providerOption,
            });
            if (opts.project !== undefined) {
              result.sessions = result.sessions.filter(
                (session) => session.projectId === opts.project,
              );
            }
            if (opts.all === true) {
              await importAllSessions(
                result.sessions.filter(
                  (session) =>
                    session.projectId !== null &&
                    session.importedThreadId === null,
                ),
                (session) =>
                  sdk.threads.experimental_importProviderSession({
                    sessionId: session.sessionId,
                    hostId,
                    origin: "cli",
                    ...providerOption,
                  }),
                opts,
              );
              return;
            }
            if (outputJson(opts, result)) return;
            if (result.sessions.length === 0) {
              console.log("No sessions found");
              return;
            }
            printSessionTable(result.sessions);
            return;
          }
          if (sessionId === undefined) {
            throw new Error("Pass a session ID, or --list to see sessions.");
          }
          let thread;
          try {
            thread = await sdk.threads.experimental_importProviderSession({
              sessionId,
              hostId,
              origin: "cli",
              ...providerOption,
            });
          } catch (error: unknown) {
            throw prependErrorContext(
              `Failed to import session ${sessionId}`,
              error,
            );
          }
          if (outputJson(opts, thread)) return;
          console.log(`Thread imported: ${thread.id}`);
          console.log(`Title: ${thread.title ?? "-"}`);
          console.log(`Status: ${thread.status}`);
        },
      ),
    );
}
