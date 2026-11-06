import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { afterAll, expect, it } from "vitest";
import entry, { findTsServer, parseFrames } from "./host";

const hostFile = fileURLToPath(new URL("./host.ts", import.meta.url));

function frame(message: unknown): Buffer {
  const json = `${JSON.stringify(message)}\n`;
  return Buffer.from(`Content-Length: ${Buffer.byteLength(json)}\r\n\r\n${json}`);
}

it("parses tsserver frames split across chunks with multibyte text", () => {
  const first = frame({ type: "event", body: "naïve ✓" });
  const second = frame({ type: "response", request_seq: 1 });
  const joined = Buffer.concat([first, second]);
  const cut = first.length + 10;

  const head = parseFrames(joined.subarray(0, cut));
  expect(head.messages).toEqual([{ type: "event", body: "naïve ✓" }]);
  const tail = parseFrames(Buffer.concat([head.rest, joined.subarray(cut)]));
  expect(tail.messages).toEqual([{ type: "response", request_seq: 1 }]);
  expect(tail.rest.length).toBe(0);
});

it("finds the workspace tsserver even behind a typescript alias package", () => {
  expect(findTsServer(hostFile)).toMatch(/\/lib\/tsserver\.js$/);
});

afterAll(() => entry.dispose?.());

it("resolves a definition in another file through tsserver", async () => {
  const content = readFileSync(hostFile, "utf8");
  const lines = content.split("\n");
  const line = lines.findIndex((text) => text.includes("contract: tsHostContract"));
  const offset = lines[line]!.indexOf("tsHostContract") + 1;
  const controller = new AbortController();
  const context = {
    signal: controller.signal,
    lifecycle: { signal: controller.signal },
    experimental_paths: { dataDir: "", tempDir: "" },
    experimental_emitSignal: async () => {},
    experimental_watch: async () => ({ dispose: async () => {} }),
    experimental_retainWorker: () => ({ dispose: async () => {} }),
  };

  const result = await entry.handlers.definition(
    { file: hostFile, content, line: line + 1, offset },
    context,
  );

  expect(result.definitions).toEqual([
    expect.objectContaining({
      file: expect.stringMatching(/monaco-editor\/contract\.ts$/),
      start: expect.objectContaining({ line: expect.any(Number) }),
    }),
  ]);
}, 90_000);
