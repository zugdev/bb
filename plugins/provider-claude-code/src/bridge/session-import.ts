import type {
  ExperimentalProviderSessionStep,
  ExperimentalProviderSessionSummary,
  ExperimentalProviderSessionTurn,
  ExperimentalSessionsListResult,
  ExperimentalSessionsReadResult,
  ThreadDelta,
} from "@get-bb/plugin-sdk/provider-bridge";
import { open, readdir, stat } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { createClaudeDeltaTranslator } from "../delta-translation.js";
import { findTranscript } from "./session-fork.js";

export const MAX_IMPORTED_TURNS = 500;
const TITLE_MAX_LENGTH = 120;
const TRANSCRIPT_EXTENSION = ".jsonl";
const IMPORT_THREAD_ID = "claude-session-import";

const contentBlockSchema = z.looseObject({ type: z.string() });
const conversationEntrySchema = z.looseObject({
  type: z.enum(["user", "assistant"]),
  message: z.looseObject({
    content: z.union([z.string(), z.array(contentBlockSchema)]).optional(),
  }),
  uuid: z.string().optional(),
  sessionId: z.string().optional(),
  timestamp: z.string().optional(),
  cwd: z.string().optional(),
  isSidechain: z.boolean().optional(),
  isMeta: z.boolean().optional(),
});
type ConversationEntry = z.infer<typeof conversationEntrySchema>;
const cwdEntrySchema = z.looseObject({ cwd: z.string().min(1) });

const SKIPPED_PROMPT_PREFIXES = [
  "<local-command-stdout>",
  "<local-command-stderr>",
  "<local-command-caveat>",
  "[Request interrupted by user",
];
const COMMAND_NAME_PATTERN = /<command-name>([^<]*)<\/command-name>/;
const COMMAND_ARGS_PATTERN = /<command-args>([^<]*)<\/command-args>/;
const PASTED_CONTENT_TAG_PATTERN = /<\/?pasted_content\b[^>]*>/g;

type ClassifiedEntry =
  | { kind: "prompt"; text: string }
  | { kind: "conversation" }
  | { kind: "skip" };

function textOfBlock(block: z.infer<typeof contentBlockSchema>): string | null {
  return block.type === "text" && typeof block.text === "string"
    ? block.text
    : null;
}

function promptText(entry: ConversationEntry): string | null {
  const content = entry.message.content;
  if (typeof content === "string") {
    return content;
  }
  if (content === undefined) {
    return null;
  }
  if (content.some((block) => block.type === "tool_result")) {
    return null;
  }
  return content
    .map(textOfBlock)
    .filter((text): text is string => text !== null)
    .join("\n");
}

function normalizePrompt(text: string): string | null {
  const trimmed = text.replace(PASTED_CONTENT_TAG_PATTERN, "").trim();
  if (SKIPPED_PROMPT_PREFIXES.some((prefix) => trimmed.startsWith(prefix))) {
    return null;
  }
  const commandName = COMMAND_NAME_PATTERN.exec(trimmed)?.[1]?.trim();
  if (commandName !== undefined && commandName.length > 0) {
    const commandArgs = COMMAND_ARGS_PATTERN.exec(trimmed)?.[1]?.trim() ?? "";
    return commandArgs.length > 0
      ? `${commandName} ${commandArgs}`
      : commandName;
  }
  return trimmed.length > 0 ? trimmed : null;
}

function classifyEntry(entry: ConversationEntry): ClassifiedEntry {
  if (entry.isSidechain === true || entry.isMeta === true) {
    return { kind: "skip" };
  }
  if (entry.type === "assistant") {
    return { kind: "conversation" };
  }
  const text = promptText(entry);
  if (text === null) {
    return { kind: "conversation" };
  }
  const prompt = normalizePrompt(text);
  return prompt === null ? { kind: "skip" } : { kind: "prompt", text: prompt };
}

function parseConversationEntry(value: unknown): ConversationEntry | null {
  const parsed = conversationEntrySchema.safeParse(value);
  return parsed.success ? parsed.data : null;
}

function entryTime(entry: ConversationEntry, fallback: number): number {
  const parsed =
    entry.timestamp === undefined ? Number.NaN : Date.parse(entry.timestamp);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : fallback;
}

function truncateTitle(prompt: string): string {
  const firstLine = prompt.split("\n", 1)[0] ?? "";
  return firstLine.length > TITLE_MAX_LENGTH
    ? `${firstLine.slice(0, TITLE_MAX_LENGTH - 1)}…`
    : firstLine;
}

export interface ClaudeTranscriptTurns {
  cwd: string | null;
  turns: ExperimentalProviderSessionTurn[];
  truncated: boolean;
}

interface OpenTurn {
  prompt: string;
  startedAt: number;
  steps: ExperimentalProviderSessionStep[];
  translator: ReturnType<typeof createClaudeDeltaTranslator>;
}

function translateEntry(
  turn: OpenTurn,
  entry: ConversationEntry,
): ThreadDelta[] {
  return turn.translator.translate(
    {
      jsonrpc: "2.0",
      method: "sdk/message",
      params: {
        threadId: IMPORT_THREAD_ID,
        message: {
          type: entry.type,
          message: entry.message,
          uuid: entry.uuid,
          session_id: entry.sessionId,
          parent_tool_use_id: null,
        },
      },
    },
    { threadId: IMPORT_THREAD_ID },
  );
}

function closeTurn(turn: OpenTurn): ExperimentalProviderSessionTurn {
  const lastAt = turn.steps.at(-1)?.at ?? turn.startedAt;
  return {
    prompt: turn.prompt,
    startedAt: turn.startedAt,
    steps: [
      { at: turn.startedAt, deltas: [{ kind: "turn.open" }] },
      ...turn.steps,
      {
        at: lastAt,
        deltas: [{ kind: "turn.boundary", status: "completed" }],
      },
    ],
  };
}

export function splitClaudeTranscript(
  entries: readonly unknown[],
  options: { fallbackTime: number; maxTurns: number },
): ClaudeTranscriptTurns {
  const turns: ExperimentalProviderSessionTurn[] = [];
  let cwd: string | null = null;
  let current: OpenTurn | null = null;
  let lastAt = options.fallbackTime;
  for (const value of entries) {
    const entry = parseConversationEntry(value);
    if (entry === null) {
      continue;
    }
    cwd ??= entry.cwd ?? null;
    const at = entryTime(entry, lastAt);
    lastAt = at;
    const classified = classifyEntry(entry);
    if (classified.kind === "skip") {
      continue;
    }
    if (classified.kind === "prompt") {
      if (current !== null) {
        turns.push(closeTurn(current));
      }
      current = {
        prompt: classified.text,
        startedAt: at,
        steps: [],
        translator: createClaudeDeltaTranslator({
          ...(cwd !== null ? { cwd } : {}),
          sandboxEnabled: false,
        }),
      };
      continue;
    }
    if (current === null) {
      continue;
    }
    const deltas = translateEntry(current, entry);
    if (deltas.length > 0) {
      current.steps.push({ at, deltas });
    }
  }
  if (current !== null) {
    turns.push(closeTurn(current));
  }
  const truncated = turns.length > options.maxTurns;
  return {
    cwd,
    turns: truncated ? turns.slice(turns.length - options.maxTurns) : turns,
    truncated,
  };
}

export async function readClaudeSession(args: {
  configDirectory: string;
  sessionId: string;
}): Promise<ExperimentalSessionsReadResult> {
  const found = await findTranscript(
    join(args.configDirectory, "projects"),
    args.sessionId,
  );
  if (found === null) {
    throw new Error(`Claude session ${args.sessionId} was not found`);
  }
  const transcriptStat = await stat(
    join(found.projectDirectory, `${args.sessionId}${TRANSCRIPT_EXTENSION}`),
  );
  const split = splitClaudeTranscript(found.entries, {
    fallbackTime: Math.floor(transcriptStat.mtimeMs),
    maxTurns: MAX_IMPORTED_TURNS,
  });
  if (split.cwd === null) {
    throw new Error(
      `Claude session ${args.sessionId} does not record a working directory`,
    );
  }
  return {
    sessionId: args.sessionId,
    cwd: split.cwd,
    turns: split.turns,
    truncated: split.truncated,
  };
}

async function readSessionSummary(
  path: string,
  sessionId: string,
): Promise<ExperimentalProviderSessionSummary | null> {
  const transcriptStat = await stat(path);
  const transcript = await open(path);
  let cwd: string | null = null;
  let title: string | null = null;
  try {
    for await (const line of transcript.readLines()) {
      if (cwd !== null && title !== null) {
        break;
      }
      if (line.trim().length === 0) {
        continue;
      }
      let value: unknown;
      try {
        value = JSON.parse(line);
      } catch {
        continue;
      }
      if (cwd === null) {
        const cwdEntry = cwdEntrySchema.safeParse(value);
        cwd = cwdEntry.success ? cwdEntry.data.cwd : null;
      }
      if (title === null) {
        const entry = parseConversationEntry(value);
        const classified = entry === null ? null : classifyEntry(entry);
        title =
          classified?.kind === "prompt" ? truncateTitle(classified.text) : null;
      }
    }
  } finally {
    await transcript.close();
  }
  if (cwd === null || title === null) {
    return null;
  }
  return {
    sessionId,
    cwd,
    title,
    updatedAt: Math.floor(transcriptStat.mtimeMs),
    sizeBytes: transcriptStat.size,
  };
}

async function listDirectoryNames(
  path: string,
  kind: "directory" | "file",
): Promise<string[]> {
  try {
    return (await readdir(path, { withFileTypes: true }))
      .filter((entry) =>
        kind === "directory" ? entry.isDirectory() : entry.isFile(),
      )
      .map((entry) => entry.name);
  } catch {
    return [];
  }
}

export async function listClaudeSessions(args: {
  configDirectory: string;
}): Promise<ExperimentalSessionsListResult> {
  const projectsDirectory = join(args.configDirectory, "projects");
  const sessions: ExperimentalProviderSessionSummary[] = [];
  for (const projectName of await listDirectoryNames(
    projectsDirectory,
    "directory",
  )) {
    const projectDirectory = join(projectsDirectory, projectName);
    for (const fileName of await listDirectoryNames(projectDirectory, "file")) {
      if (!fileName.endsWith(TRANSCRIPT_EXTENSION)) {
        continue;
      }
      const summary = await readSessionSummary(
        join(projectDirectory, fileName),
        fileName.slice(0, -TRANSCRIPT_EXTENSION.length),
      ).catch(() => null);
      if (summary !== null) {
        sessions.push(summary);
      }
    }
  }
  sessions.sort((left, right) => right.updatedAt - left.updatedAt);
  return { sessions };
}
