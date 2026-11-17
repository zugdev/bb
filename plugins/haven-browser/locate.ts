import { access, readdir, realpath, stat } from "node:fs/promises";
import { createConnection } from "node:net";
import { dirname, join } from "node:path";
import { z } from "zod";
import { checkoutSessionName, sharedSessionName } from "./session-name.js";

const namespace = "haven-cookies-v1";
const requestTimeoutMs = 5_000;

const sessionInfoSchema = z.object({ browserLaunched: z.boolean() });
const cdpUrlSchema = z.object({ cdpUrl: z.string().url() });

function request<T>(
  socket: string,
  action: string,
  schema: z.ZodType<T>,
): Promise<T> {
  return new Promise((resolve, reject) => {
    const connection = createConnection(socket, () =>
      connection.write(
        `${JSON.stringify({ id: `bb-${Date.now()}`, action })}\n`,
      ),
    );
    connection.setTimeout(requestTimeoutMs, () =>
      connection.destroy(new Error(`${action} timed out`)),
    );
    let buffered = "";
    connection.on("data", (chunk) => {
      buffered += chunk.toString("utf8");
      const end = buffered.indexOf("\n");
      if (end === -1) return;
      connection.end();
      try {
        const response = z
          .object({
            success: z.boolean(),
            data: z.unknown(),
            error: z.string().nullish(),
          })
          .parse(JSON.parse(buffered.slice(0, end)));
        if (!response.success)
          throw new Error(response.error ?? `${action} failed`);
        resolve(schema.parse(response.data));
      } catch (error) {
        reject(error);
      }
    });
    connection.on("error", reject);
  });
}

export async function findCheckout(cwd: string): Promise<string | null> {
  let directory = await realpath(cwd);
  while (true) {
    const isCheckout = await access(join(directory, "typescript")).then(
      () => true,
      () => false,
    );
    if (isCheckout) return directory;
    const parent = dirname(directory);
    if (parent === directory) return null;
    directory = parent;
  }
}

async function socketsFor(socketRoot: string, session: string) {
  const roots = (await readdir(socketRoot).catch(() => [])).filter((name) =>
    name.startsWith("haven-browser-"),
  );
  const found = await Promise.all(
    roots.map(async (root) => {
      const socket = join(
        socketRoot,
        root,
        "namespaces",
        namespace,
        "run",
        `${session}.sock`,
      );
      const info = await stat(socket).catch(() => null);
      return info ? { socket, modified: info.mtimeMs } : null;
    }),
  );
  return found
    .filter((entry) => entry !== null)
    .sort((a, b) => b.modified - a.modified)
    .map((entry) => entry.socket);
}

export async function locateHavenBrowser(args: {
  profile: string;
  cwd: string | undefined;
  socketRoot: string;
}): Promise<{ session: string; cdpUrl: string }> {
  const checkout = args.cwd ? await findCheckout(args.cwd) : null;
  const sessions = [
    ...(checkout ? [checkoutSessionName(args.profile, checkout)] : []),
    sharedSessionName(args.profile),
  ];
  for (const session of sessions) {
    for (const socket of await socketsFor(args.socketRoot, session)) {
      const info = await request(
        socket,
        "session_info",
        sessionInfoSchema,
      ).catch(() => null);
      if (!info?.browserLaunched) continue;
      const { cdpUrl } = await request(socket, "cdp_url", cdpUrlSchema);
      return { session, cdpUrl };
    }
  }
  throw new Error(
    `No open haven browser for profile '${args.profile}'; run \`haven browser open ${args.profile}\` first`,
  );
}
