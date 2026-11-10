import { randomInt } from "node:crypto";
import {
  PluginCliError,
  cliCommand,
  defineCli,
  type BbPluginApi,
  type PluginCliContext,
  type PluginCliResult,
} from "@get-bb/plugin-sdk";
import {
  COMMAND_REQUEST_RENDERER_ID,
  commandRequestResponseSchema,
  commandSchema,
} from "./command-request.js";

const TERMINAL_ID_ALPHABET = "23456789abcdefghijkmnpqrstuvwxyz";
const ROW_LABEL_MAX_LENGTH = 80;
const REQUEST_TIMEOUT_MS = 24 * 60 * 60 * 1000;

function cliError(message: string, code: string, hint?: string): never {
  throw new PluginCliError(message, {
    code,
    ...(hint === undefined ? {} : { hint }),
  });
}

function clampToLength(text: string, max: number): string {
  const line = text.split("\n")[0] ?? text;
  return line.length <= max ? line : `${line.slice(0, max - 1)}…`;
}

function newTerminalId(): string {
  let suffix = "";
  for (let index = 0; index < 10; index += 1) {
    suffix += TERMINAL_ID_ALPHABET[randomInt(TERMINAL_ID_ALPHABET.length)];
  }
  return `term_${suffix}`;
}

async function runRequest(
  bb: BbPluginApi,
  input: { command: string; purpose: string | undefined },
  ctx: PluginCliContext,
): Promise<PluginCliResult> {
  const threadId = ctx.threadId;
  if (!threadId)
    cliError("bb command request must run from a bb thread.", "missing_thread");
  const parsedCommand = commandSchema.safeParse(input.command);
  if (!parsedCommand.success) {
    cliError(
      parsedCommand.error.issues[0]?.message ?? "Invalid command.",
      "invalid_command",
    );
  }
  const command = parsedCommand.data;
  const purpose = input.purpose?.trim() || null;
  const terminalId = newTerminalId();

  const result = await bb.ui.requestInput(
    {
      threadId,
      rendererId: COMMAND_REQUEST_RENDERER_ID,
      title: "Run command",
      payload: { command, purpose, terminalId },
      timeoutMs: REQUEST_TIMEOUT_MS,
      presentation: {
        icon: { glyph: "Terminal" },
        label: {
          pending: clampToLength(`Asking to run ${command}`, ROW_LABEL_MAX_LENGTH),
          completed: clampToLength(`Ran ${command}`, ROW_LABEL_MAX_LENGTH),
        },
      },
      describeSubmission: () => ({ title: "Ran in terminal", detail: command }),
    },
    { signal: ctx.signal },
  );
  if (result.outcome === "cancelled") {
    if (result.reason === "timeout") {
      cliError(
        "The user did not answer the command request within 24 hours.",
        "command_request_expired",
      );
    }
    cliError(
      `The user declined to run the command (${result.reason}).`,
      "command_declined",
      "Do not retry the same command unless the user asks.",
    );
  }
  commandRequestResponseSchema.parse(result.value);

  await bb.sdk.terminals.create({
    id: terminalId,
    scope: { kind: "thread", threadId },
    start: { mode: "command", command },
    title: clampToLength(command, ROW_LABEL_MAX_LENGTH),
    cols: 120,
    rows: 32,
  });
  return {
    exitCode: 0,
    stdout: `${JSON.stringify({
      terminalId,
      next: `bb terminal wait ${terminalId} --timeout 10m --json`,
    })}\n`,
  };
}

export default function plugin(bb: BbPluginApi) {
  bb.cli.register(
    defineCli({
      name: "command",
      summary: "Ask the user to run a terminal command.",
      description:
        "Shows the command in a card in the thread. It runs in a new terminal in the thread's sidebar only when the user clicks Run.",
      commands: {
        request: cliCommand({
          summary: "Suggest one command for the user to run.",
          description:
            "The command runs in the thread's workspace with the user's shell. Include `cd <dir> &&` in the command when it must run elsewhere. Prints the terminal ID once the user runs it; read the result with `bb terminal wait <id>`.",
          positionals: [
            {
              name: "command",
              description: "The shell command, as one quoted argument",
              required: true,
            },
          ],
          options: {
            purpose: {
              type: "string",
              placeholder: "TEXT",
              aliases: ["reason", "why"],
              description: "One line telling the user why the command is needed",
            },
            json: {
              type: "boolean",
              description: "Report failures as a JSON envelope on stdout",
            },
          },
          async run(input, ctx) {
            try {
              return await runRequest(
                bb,
                {
                  command: input.positionals.command,
                  purpose: input.options.purpose,
                },
                ctx,
              );
            } catch (error) {
              if (error instanceof PluginCliError) throw error;
              throw new PluginCliError(
                error instanceof Error ? error.message : String(error),
              );
            }
          },
        }),
      },
    }),
  );
}
