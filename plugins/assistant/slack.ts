import { z } from "zod";

export interface SlackWorkspace {
  token: string;
  team: string;
  userId: string;
}

export interface SlackMessage {
  workspace: string;
  channel: string;
  channelId: string;
  ts: string;
  from: string;
  fromId: string;
  text: string;
  permalink: string;
}

const okSchema = z.object({ ok: z.boolean(), error: z.string().optional() });

const authSchema = z.object({ team: z.string(), user_id: z.string() });

const matchSchema = z.object({
  ts: z.string(),
  text: z.string().default(""),
  user: z.string().optional(),
  username: z.string().optional(),
  permalink: z.string().default(""),
  channel: z.object({ id: z.string(), name: z.string().optional() }),
});

const searchSchema = z.object({
  messages: z.object({ matches: z.array(matchSchema) }),
});

const repliesSchema = z.object({
  messages: z.array(
    z.object({
      ts: z.string(),
      text: z.string().default(""),
      user: z.string().optional(),
    }),
  ),
});

async function slackApi<T>(
  token: string,
  method: string,
  params: Record<string, string>,
  schema: z.ZodType<T>,
): Promise<T> {
  const response = await fetch(
    `https://slack.com/api/${method}?${new URLSearchParams(params)}`,
    { headers: { authorization: `Bearer ${token}` } },
  );
  const body: unknown = await response.json();
  const status = okSchema.parse(body);
  if (!status.ok) {
    throw new Error(`Slack ${method} failed: ${status.error ?? response.status}`);
  }
  return schema.parse(body);
}

export function parseSlackTokens(raw: string | undefined): string[] {
  return (raw ?? "").split(/[\s,]+/).filter((token) => token.length > 0);
}

export async function connectSlack(token: string): Promise<SlackWorkspace> {
  const auth = await slackApi(token, "auth.test", {}, authSchema);
  return { token, team: auth.team, userId: auth.user_id };
}

export async function searchSlack(
  workspace: SlackWorkspace,
  query: string,
  count = 20,
): Promise<SlackMessage[]> {
  const result = await slackApi(
    workspace.token,
    "search.messages",
    { query, sort: "timestamp", sort_dir: "desc", count: String(count) },
    searchSchema,
  );
  return result.messages.matches.map((match) => ({
    workspace: workspace.team,
    channel: match.channel.name ?? match.channel.id,
    channelId: match.channel.id,
    ts: match.ts,
    from: match.username ?? match.user ?? "unknown",
    fromId: match.user ?? "",
    text: match.text,
    permalink: match.permalink,
  }));
}

export async function readSlackThread(
  workspace: SlackWorkspace,
  channelId: string,
  ts: string,
): Promise<string> {
  const result = await slackApi(
    workspace.token,
    "conversations.replies",
    { channel: channelId, ts, limit: "50" },
    repliesSchema,
  );
  return result.messages
    .map((message) => `[${message.ts}] ${message.user ?? "?"}: ${message.text}`)
    .join("\n");
}

export function newPings(
  workspace: SlackWorkspace,
  messages: SlackMessage[],
  sinceTs: string,
): SlackMessage[] {
  const seen = new Set<string>();
  return messages
    .filter((message) => Number(message.ts) > Number(sinceTs))
    .filter((message) => message.fromId !== workspace.userId)
    .filter((message) => {
      const key = `${message.channelId}:${message.ts}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => Number(a.ts) - Number(b.ts));
}

export async function fetchPings(
  workspace: SlackWorkspace,
  sinceTs: string,
): Promise<SlackMessage[]> {
  const [mentions, directMessages] = await Promise.all([
    searchSlack(workspace, `<@${workspace.userId}>`),
    searchSlack(workspace, "is:dm"),
  ]);
  return newPings(workspace, [...mentions, ...directMessages], sinceTs);
}
