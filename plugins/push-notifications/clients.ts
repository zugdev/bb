import type { BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import {
  appClientSchema,
  type AppClient,
  type RegisterClientInput,
} from "./contract.js";

const CLIENT_KEY_PREFIX = "client:";
const THREAD_ORIGIN_KEY_PREFIX = "thread-origin:";
export const CLIENT_ONLINE_MS = 5 * 60 * 1_000;

export interface AppClientStore {
  register(clientId: string, input: RegisterClientInput): Promise<void>;
  get(clientId: string): Promise<AppClient | null>;
  list(): Promise<AppClient[]>;
  isOnline(client: AppClient): boolean;
  getThreadOrigin(threadId: string): Promise<string | null>;
  setThreadOrigin(threadId: string, clientId: string): Promise<void>;
  forgetThread(threadId: string): Promise<void>;
}

export function createAppClientStore(
  bb: BbPluginApi,
  options: { now?: () => number } = {},
): AppClientStore {
  const now = options.now ?? Date.now;

  async function get(clientId: string): Promise<AppClient | null> {
    const parsed = appClientSchema.safeParse(
      await bb.storage.kv.get<unknown>(`${CLIENT_KEY_PREFIX}${clientId}`),
    );
    return parsed.success ? parsed.data : null;
  }

  return {
    async register(clientId, input) {
      await bb.storage.kv.set(`${CLIENT_KEY_PREFIX}${clientId}`, {
        id: clientId,
        ...input,
        lastSeenAt: now(),
      } satisfies AppClient);
    },
    get,
    async list() {
      const keys = await bb.storage.kv.list(CLIENT_KEY_PREFIX);
      const clients: AppClient[] = [];
      for (const key of keys) {
        const client = await get(key.slice(CLIENT_KEY_PREFIX.length));
        if (client !== null) clients.push(client);
      }
      return clients.sort((left, right) => right.lastSeenAt - left.lastSeenAt);
    },
    isOnline: (client) => now() - client.lastSeenAt <= CLIENT_ONLINE_MS,
    async getThreadOrigin(threadId) {
      const parsed = z
        .string()
        .min(1)
        .safeParse(
          await bb.storage.kv.get<unknown>(
            `${THREAD_ORIGIN_KEY_PREFIX}${threadId}`,
          ),
        );
      return parsed.success ? parsed.data : null;
    },
    async setThreadOrigin(threadId, clientId) {
      await bb.storage.kv.set(
        `${THREAD_ORIGIN_KEY_PREFIX}${threadId}`,
        clientId,
      );
    },
    async forgetThread(threadId) {
      await bb.storage.kv.delete(`${THREAD_ORIGIN_KEY_PREFIX}${threadId}`);
    },
  };
}
