import type { ChildProcess } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { experimental_forkHostProcess as fork } from "@get-bb/plugin-sdk/process";
import {
  experimental_defineHostEntry,
  type ExperimentalHostWorkerLease,
} from "@get-bb/plugin-sdk/host";
import { tsHostContract } from "./contract.js";

const REQUEST_TIMEOUT_MS = 60_000;
const IDLE_SHUTDOWN_MS = 15 * 60_000;

export function findTsServer(file: string): string | null {
  let packageJson: string;
  try {
    packageJson = createRequire(file).resolve("typescript/package.json");
  } catch {
    return null;
  }
  const direct = join(dirname(packageJson), "lib", "tsserver.js");
  if (existsSync(direct)) return direct;
  try {
    return createRequire(packageJson).resolve("@typescript/old/lib/tsserver.js");
  } catch {
    return null;
  }
}

interface Pending {
  resolve: (body: unknown) => void;
  reject: (error: Error) => void;
  timer: NodeJS.Timeout;
}

export function parseFrames(buffer: Buffer): { messages: unknown[]; rest: Buffer } {
  const messages: unknown[] = [];
  let rest = buffer;
  for (;;) {
    const headerEnd = rest.indexOf("\r\n\r\n");
    if (headerEnd < 0) break;
    const match = /Content-Length: (\d+)/i.exec(rest.subarray(0, headerEnd).toString("utf8"));
    const start = headerEnd + 4;
    if (match === null) {
      rest = rest.subarray(start);
      continue;
    }
    const length = Number(match[1]);
    if (rest.length < start + length) break;
    messages.push(JSON.parse(rest.subarray(start, start + length).toString("utf8")));
    rest = rest.subarray(start + length);
  }
  return { messages, rest };
}

class TsServer {
  private seq = 0;
  private buffer: Buffer = Buffer.alloc(0);
  private readonly pending = new Map<number, Pending>();
  private readonly openFiles = new Map<string, string>();
  private idleTimer: NodeJS.Timeout | null = null;

  constructor(
    private readonly child: ChildProcess,
    private readonly lease: ExperimentalHostWorkerLease,
    private readonly onExit: () => void,
  ) {
    child.stdout?.on("data", (chunk: Buffer) => this.receive(chunk));
    child.stderr?.resume();
    child.once("exit", () => this.shutdown(new Error("tsserver exited")));
    child.once("error", (error) => this.shutdown(error));
    this.touch();
  }

  private touch() {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    this.idleTimer = setTimeout(() => this.child.kill(), IDLE_SHUTDOWN_MS);
  }

  private shutdown(error: Error) {
    if (this.idleTimer !== null) clearTimeout(this.idleTimer);
    for (const entry of this.pending.values()) {
      clearTimeout(entry.timer);
      entry.reject(error);
    }
    this.pending.clear();
    void this.lease.dispose();
    this.onExit();
  }

  kill() {
    this.child.kill();
  }

  private receive(chunk: Buffer) {
    const { messages, rest } = parseFrames(Buffer.concat([this.buffer, chunk]));
    this.buffer = rest;
    for (const message of messages) {
      if (typeof message !== "object" || message === null) continue;
      const response = message as {
        type?: string;
        request_seq?: number;
        success?: boolean;
        body?: unknown;
        message?: string;
      };
      if (response.type !== "response" || response.request_seq === undefined) continue;
      const entry = this.pending.get(response.request_seq);
      if (entry === undefined) continue;
      this.pending.delete(response.request_seq);
      clearTimeout(entry.timer);
      if (response.success === false) {
        entry.reject(new Error(response.message ?? "tsserver request failed"));
      } else {
        entry.resolve(response.body);
      }
    }
  }

  request(command: string, args: unknown): Promise<unknown> {
    this.touch();
    const seq = ++this.seq;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pending.delete(seq);
        reject(new Error(`tsserver ${command} timed out`));
      }, REQUEST_TIMEOUT_MS);
      this.pending.set(seq, { resolve, reject, timer });
      this.child.stdin?.write(
        `${JSON.stringify({ seq, type: "request", command, arguments: args })}\n`,
      );
    });
  }

  async sync(file: string, content: string) {
    if (this.openFiles.get(file) === content) return;
    await this.request("updateOpen", { openFiles: [{ file, fileContent: content }] });
    this.openFiles.set(file, content);
  }
}

const servers = new Map<string, TsServer>();

function serverFor(
  file: string,
  retain: () => ExperimentalHostWorkerLease,
): TsServer | null {
  const tsserverPath = findTsServer(file);
  if (tsserverPath === null) return null;
  const existing = servers.get(tsserverPath);
  if (existing !== undefined) return existing;
  const child = fork(tsserverPath, ["--disableAutomaticTypingAcquisition", "--locale", "en"], {
    cwd: dirname(file),
    execArgv: [],
    stdio: ["pipe", "pipe", "pipe", "ipc"],
  });
  const server = new TsServer(child, retain(), () => servers.delete(tsserverPath));
  servers.set(tsserverPath, server);
  return server;
}

function documentationText(documentation: unknown): string {
  if (typeof documentation === "string") return documentation;
  if (!Array.isArray(documentation)) return "";
  return documentation
    .map((part: { text?: unknown }) => (typeof part.text === "string" ? part.text : ""))
    .join("");
}

export default experimental_defineHostEntry({
  contract: tsHostContract,
  handlers: {
    async definition({ file, content, line, offset }, context) {
      const server = serverFor(file, () => context.experimental_retainWorker());
      if (server === null) return { definitions: [] };
      await server.sync(file, content);
      const body = (await server.request("definitionAndBoundSpan", { file, line, offset })) as {
        definitions?: { file: string; start: { line: number; offset: number }; end: { line: number; offset: number } }[];
      } | undefined;
      return {
        definitions: (body?.definitions ?? []).map((entry) => ({
          file: entry.file,
          start: { line: entry.start.line, offset: entry.start.offset },
          end: { line: entry.end.line, offset: entry.end.offset },
        })),
      };
    },
    async hover({ file, content, line, offset }, context) {
      const server = serverFor(file, () => context.experimental_retainWorker());
      if (server === null) return { contents: [] };
      await server.sync(file, content);
      const body = (await server
        .request("quickinfo", { file, line, offset })
        .catch(() => undefined)) as { displayString?: string; documentation?: unknown } | undefined;
      if (body?.displayString === undefined || body.displayString === "") return { contents: [] };
      const documentation = documentationText(body.documentation);
      return {
        contents: [
          `\`\`\`typescript\n${body.displayString}\n\`\`\``,
          ...(documentation === "" ? [] : [documentation]),
        ],
      };
    },
  },
  dispose() {
    for (const server of servers.values()) server.kill();
    servers.clear();
  },
});
