import { mkdir, mkdtemp, realpath, rm } from "node:fs/promises";
import { createServer, type Server } from "node:net";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { locateHavenBrowser } from "./locate.js";
import { checkoutSessionName, sharedSessionName } from "./session-name.js";

const servers: Server[] = [];
const roots: string[] = [];

afterEach(async () => {
  await Promise.all(
    servers
      .splice(0)
      .map((server) => new Promise((done) => server.close(done))),
  );
  await Promise.all(
    roots.splice(0).map((root) => rm(root, { recursive: true, force: true })),
  );
});

async function fakeSession(
  root: string,
  session: string,
  browser: { launched: boolean; port: number },
) {
  const run = join(
    root,
    "haven-browser-0",
    "namespaces",
    "haven-cookies-v1",
    "run",
  );
  await mkdir(run, { recursive: true });
  const actions: string[] = [];
  const server = createServer((socket) => {
    socket.on("data", (chunk) => {
      const { id, action } = JSON.parse(chunk.toString());
      actions.push(action);
      const data =
        action === "session_info"
          ? { browserLaunched: browser.launched }
          : { cdpUrl: `ws://127.0.0.1:${browser.port}/devtools/browser/x` };
      socket.end(
        `${JSON.stringify({ id, success: true, data, error: null })}\n`,
      );
    });
  });
  await new Promise<void>((done) =>
    server.listen(join(run, `${session}.sock`), done),
  );
  servers.push(server);
  return actions;
}

async function setup() {
  const root = await realpath(await mkdtemp("/tmp/hb-"));
  const checkout = join(root, "checkout");
  await mkdir(join(checkout, "typescript", "packages"), { recursive: true });
  roots.push(root);
  return { root, checkout };
}

describe("locateHavenBrowser", () => {
  it("prefers this checkout's window over the shared profile window", async () => {
    const { root, checkout } = await setup();
    await fakeSession(root, sharedSessionName("admin"), {
      launched: true,
      port: 1,
    });
    await fakeSession(root, checkoutSessionName("admin", checkout), {
      launched: true,
      port: 2,
    });
    const found = await locateHavenBrowser({
      profile: "admin",
      cwd: join(checkout, "typescript", "packages"),
      socketRoot: root,
    });
    expect(found.cdpUrl).toContain(":2/");
  });

  it("never asks a daemon without a running browser for its URL, since that would launch one", async () => {
    const { root, checkout } = await setup();
    const actions = await fakeSession(root, sharedSessionName("admin"), {
      launched: false,
      port: 1,
    });
    await expect(
      locateHavenBrowser({ profile: "admin", cwd: checkout, socketRoot: root }),
    ).rejects.toThrow("haven browser open admin");
    expect(actions).toEqual(["session_info"]);
  });
});
