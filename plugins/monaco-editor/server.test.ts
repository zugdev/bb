import { describe, expect, it, vi } from "vitest";
import { createFakePluginHost } from "@get-bb/plugin-sdk/testing";
import plugin from "./server";

const source = {
  kind: "thread-storage",
  threadId: "thread-editor-test",
  environmentId: "environment-editor-test",
  projectId: null,
};
const storageRootPath = "/remote-storage/thread-editor-test";
const hostId = "remote-editor-host";

async function setup(root = storageRootPath) {
  const storageLocation = vi.fn(() => ({ hostId, storageRootPath: root }));
  const read = vi.fn(() => ({
    content: "saved text",
    contentEncoding: "utf8",
    sizeBytes: 10,
    sha256: "original",
  }));
  const listPaths = vi.fn(() => ({
    paths: [{ path: "notes/document.txt", kind: "file" }],
    truncated: false,
  }));
  const write = vi.fn(() => ({ outcome: "written", sha256: "updated" }));
  const { bb, harness } = createFakePluginHost({
    pluginId: "monaco-editor",
    sdk: {
      system: { config: () => ({ dataDir: "/server-data" }) },
      threads: { storageLocation },
      files: { read, listPaths, write },
    },
  });
  await plugin(bb);
  return { harness, storageLocation, read, listPaths, write };
}

describe("thread storage host routing", () => {
  it("reads from the thread's storage host and root", async () => {
    const { harness, read, storageLocation } = await setup();
    const result = await harness.callRpc("read", {
      source,
      path: "notes/document.txt",
    });
    expect(read).toHaveBeenCalledWith({
      hostId,
      rootPath: storageRootPath,
      path: `${storageRootPath}/notes/document.txt`,
    });
    expect(storageLocation).toHaveBeenCalledWith({ threadId: source.threadId });
    expect(result).toMatchObject({
      kind: "text",
      content: "saved text",
      absolutePath: `${storageRootPath}/notes/document.txt`,
      relativePath: "notes/document.txt",
    });
  });

  it.each([
    [
      "//server/share/storage",
      "\\\\server\\share\\storage\\notes\\document.txt",
    ],
    ["C:", "C:\\notes\\document.txt"],
  ])("reads and names files under %s", async (root, expected) => {
    const { harness, read } = await setup(root);
    try {
      expect(
        await harness.callRpc("read", { source, path: "notes/document.txt" }),
      ).toMatchObject({
        absolutePath: expected,
        relativePath: "notes/document.txt",
      });
      expect(read).toHaveBeenCalledWith({
        hostId,
        rootPath: root,
        path: expected,
      });
    } finally {
      await harness.lifecycle.dispose();
    }
  });

  it("lists the thread's storage host and root", async () => {
    const { harness, listPaths } = await setup();
    const result = await harness.callRpc("tree", { source });
    expect(listPaths).toHaveBeenCalledWith({
      hostId,
      path: storageRootPath,
      includeFiles: true,
      includeDirectories: true,
      includeHidden: true,
      limit: 10_000,
      excludeNames: [
        ".git",
        "node_modules",
        ".pnpm-store",
        ".turbo",
        ".trees",
        "worktrees",
        "dist",
      ],
    });
    expect(result).toEqual({
      root: storageRootPath,
      entries: [{ path: "notes/document.txt", kind: "file" }],
      truncated: false,
    });
  });

  it("saves to the thread's storage host with the expected version", async () => {
    const { harness, write } = await setup();
    const result = await harness.callRpc("write", {
      source,
      path: "notes/document.txt",
      content: "edited text",
      expectedSha256: "original",
    });
    expect(write).toHaveBeenCalledWith({
      hostId,
      rootPath: storageRootPath,
      path: `${storageRootPath}/notes/document.txt`,
      content: "edited text",
      contentEncoding: "utf8",
      expectedSha256: "original",
    });
    expect(result).toEqual({ outcome: "written", sha256: "updated" });
  });
});

describe("go to definition", () => {
  it("asks the environment's host and names targets relative to the workspace", async () => {
    const workspace = "/work/repo";
    const { bb, harness } = createFakePluginHost({
      pluginId: "monaco-editor",
      sdk: {
        environments: {
          get: () => ({ id: "env_1", path: workspace, hostId: "laptop" }),
        },
      },
      experimental_callHostRpc: () => ({
        definitions: [
          {
            file: `${workspace}/src/contract.ts`,
            start: { line: 3, offset: 14 },
            end: { line: 3, offset: 28 },
          },
          {
            file: "/opt/lib/lib.dom.d.ts",
            start: { line: 1, offset: 1 },
            end: { line: 1, offset: 5 },
          },
        ],
      }),
    });
    await plugin(bb);
    const result = await harness.callRpc("definition", {
      source: {
        kind: "workspace",
        threadId: "thr_1",
        environmentId: "env_1",
        projectId: null,
      },
      path: "src/host.ts",
      content: "source text",
      line: 10,
      column: 4,
    });
    expect(harness.experimental_hostRpcCalls).toEqual([
      {
        method: "definition",
        hostId: "laptop",
        input: {
          file: `${workspace}/src/host.ts`,
          content: "source text",
          line: 10,
          offset: 4,
        },
      },
    ]);
    expect(result).toEqual({
      definitions: [
        {
          absolutePath: `${workspace}/src/contract.ts`,
          relativePath: "src/contract.ts",
          startLine: 3,
          startColumn: 14,
          endLine: 3,
          endColumn: 28,
        },
        {
          absolutePath: "/opt/lib/lib.dom.d.ts",
          relativePath: null,
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 5,
        },
      ],
    });
    await harness.lifecycle.dispose();
  });
});
