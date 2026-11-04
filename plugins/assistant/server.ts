import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { assistantRpcContract } from "./contract.js";
import {
  fetchNewUnread,
  latestUid,
  readEmail,
  searchEmail,
  type EmailSummary,
  type ImapAccount,
} from "./email.js";
import {
  connectSlack,
  fetchPings,
  parseSlackTokens,
  readSlackThread,
  searchSlack,
  type SlackMessage,
  type SlackWorkspace,
} from "./slack.js";

const PERSONAL_PROJECT_ID = "proj_personal";
const THREAD_KEY = "threadId";
const EMAIL_UID_KEY = "email:lastUid";
const slackSinceKey = (team: string) => `slack:${team}:since`;

const notificationOutputSchema = z.object({
  ok: z.literal(true),
  channels: z.array(z.enum(["web", "desktop", "mobile"])),
});

function assistantInstructions(threadId: string): string {
  return `You are the user's personal assistant, a single long running thread in bb (thread id ${threadId}).
Your job is to triage the user's Slack pings and email, run their calendar, keep track of what they owe people, and tell them what needs them.
1. bb posts new Slack mentions, DMs and unread emails into this thread as they arrive. For each batch, sort items into: needs the user now, needs a reply later, and FYI. Keep FYI to one line each.
2. Call assistant_notify only when something needs the user soon: a direct question, a deadline today, a meeting about to start, or someone blocked on them. Never notify for newsletters, automated mail or FYI.
3. Use slack_search, slack_thread, email_search and email_read to get context before you judge an item.
4. For the calendar, use the Google Calendar connector tools when they are available. Add events the user asks for directly. If no calendar tools are loaded, tell the user to connect Google Calendar under claude.ai Settings, Connectors.
5. When the user asks for something recurring or later ("check my email every day at 9am", "remind me Friday"), schedule it into this thread with the bb CLI: \`bb automation create --project proj_personal --target-thread ${threadId} --name <name> --cron "<5 field cron>" --timezone <IANA zone> --prompt "<what to do>" --provider <your provider id> --model <your model>\`, or \`--at <ISO time>\` / \`--in <duration>\` for one shot reminders. Run \`bb automation list --project proj_personal\` to show or change schedules. Ask for the timezone once and remember it.
6. You never send Slack messages or email. When a reply is due, write a draft in your message for the user to copy.
7. Use the bb memory CLI to remember people, projects, the user's timezone and preferences.`;
}

export default async function plugin(bb: BbPluginApi) {
  const settings = bb.settings.define({
    slackTokens: {
      type: "string",
      label: "Slack user tokens",
      description:
        "One xoxp user token per workspace, separated by spaces or commas. Each needs the search:read, channels:history, groups:history, im:history and mpim:history user scopes.",
      secret: true,
    },
    imapHost: {
      type: "string",
      label: "IMAP host",
      description: "For example imap.gmail.com or imap.mail.me.com.",
    },
    imapPort: { type: "number", label: "IMAP port", default: 993 },
    imapUser: { type: "string", label: "IMAP user", description: "Your email address." },
    imapPassword: {
      type: "string",
      label: "IMAP app password",
      description: "An app password, not your account password.",
      secret: true,
    },
  });

  let threadId = await bb.storage.kv.get<string>(THREAD_KEY);
  const workspaces = new Map<string, SlackWorkspace>();

  async function slackWorkspaces(): Promise<SlackWorkspace[]> {
    const tokens = parseSlackTokens((await settings.get()).slackTokens);
    const connected: SlackWorkspace[] = [];
    for (const token of tokens) {
      try {
        let workspace = workspaces.get(token);
        if (workspace === undefined) {
          workspace = await connectSlack(token);
          workspaces.set(token, workspace);
        }
        connected.push(workspace);
      } catch (error) {
        bb.log.warn(`Slack token rejected: ${String(error)}`);
      }
    }
    return connected;
  }

  async function imapAccount(): Promise<ImapAccount | null> {
    const current = await settings.get();
    if (!current.imapHost || !current.imapUser || !current.imapPassword) {
      return null;
    }
    return {
      host: current.imapHost,
      port: current.imapPort,
      user: current.imapUser,
      password: current.imapPassword,
    };
  }

  async function ensureThread(): Promise<string> {
    if (threadId !== undefined) {
      try {
        const thread = await bb.sdk.threads.get({ threadId });
        if (thread.archivedAt === null) return threadId;
      } catch (error) {
        bb.log.info(`assistant thread ${threadId} is gone, starting a new one: ${String(error)}`);
      }
    }
    const thread = await bb.sdk.threads.spawn({
      projectId: PERSONAL_PROJECT_ID,
      environment: { type: "project-default" },
      title: "Assistant",
      prompt:
        "Say hello in one line, then tell me which of Slack and email are connected and what I should set up next.",
    });
    threadId = thread.id;
    await bb.storage.kv.set(THREAD_KEY, thread.id);
    return thread.id;
  }

  async function workspaceFor(team: string): Promise<SlackWorkspace> {
    const found = (await slackWorkspaces()).find((workspace) => workspace.team === team);
    if (found === undefined) throw new Error(`No connected Slack workspace named "${team}".`);
    return found;
  }

  async function requireImap(): Promise<ImapAccount> {
    const account = await imapAccount();
    if (account === null) throw new Error("Email is not connected. Set the IMAP settings in the Assistant plugin.");
    return account;
  }

  async function newSlackPings(): Promise<SlackMessage[]> {
    const pings: SlackMessage[] = [];
    for (const workspace of await slackWorkspaces()) {
      const key = slackSinceKey(workspace.team);
      const since = await bb.storage.kv.get<string>(key);
      const nowTs = String(Date.now() / 1000);
      if (since === undefined) {
        await bb.storage.kv.set(key, nowTs);
        continue;
      }
      const found = await fetchPings(workspace, since);
      pings.push(...found);
      await bb.storage.kv.set(key, found.at(-1)?.ts ?? since);
    }
    return pings;
  }

  async function newEmails(): Promise<EmailSummary[]> {
    const account = await imapAccount();
    if (account === null) return [];
    const lastUid = await bb.storage.kv.get<number>(EMAIL_UID_KEY);
    if (lastUid === undefined) {
      await bb.storage.kv.set(EMAIL_UID_KEY, await latestUid(account));
      return [];
    }
    const emails = await fetchNewUnread(account, lastUid);
    const highest = Math.max(lastUid, ...emails.map((email) => email.uid));
    await bb.storage.kv.set(EMAIL_UID_KEY, highest);
    return emails;
  }

  async function checkSources(): Promise<{ slack: number; email: number }> {
    const [pings, emails] = await Promise.all([
      newSlackPings().catch((error: unknown) => {
        bb.log.warn(`Slack check failed: ${String(error)}`);
        return [];
      }),
      newEmails().catch((error: unknown) => {
        bb.log.warn(`Email check failed: ${String(error)}`);
        return [];
      }),
    ]);
    if (pings.length === 0 && emails.length === 0) {
      return { slack: 0, email: 0 };
    }
    const lines = [
      "New items to triage:",
      ...pings.map(
        (ping) =>
          `- Slack ${ping.workspace} #${ping.channel} from ${ping.from} (channel ${ping.channelId}, ts ${ping.ts}): ${ping.text.slice(0, 400)}`,
      ),
      ...emails.map(
        (email) => `- Email uid ${email.uid} from ${email.from}: ${email.subject}`,
      ),
    ];
    await bb.sdk.threads.send({
      threadId: await ensureThread(),
      mode: "auto",
      input: [{ type: "text", text: lines.join("\n"), mentions: [] }],
    });
    return { slack: pings.length, email: emails.length };
  }

  bb.agents.registerTool({
    name: "assistant_notify",
    description:
      "Send the user a push notification to their phone, desktop and browser. Use only for items that need them soon.",
    parameters: z.object({
      title: z.string().min(1).max(80),
      body: z.string().max(180).default(""),
    }),
    async execute({ title, body }, ctx) {
      const result = await bb.sdk.plugins.callRpc({
        pluginId: "push-notifications",
        method: "notifications.send",
        input: { title, body, threadId: ctx.threadId },
        outputSchema: notificationOutputSchema,
      });
      return result.channels.length === 0
        ? "No notification channel is enabled, so nothing was delivered."
        : `Delivered to ${result.channels.join(", ")}.`;
    },
  });

  bb.agents.registerTool({
    name: "slack_search",
    description:
      "Search Slack messages across every connected workspace using Slack search syntax, for example `from:@ana in:#launch deadline`.",
    parameters: z.object({
      query: z.string().min(1),
      workspace: z.string().optional(),
      count: z.number().int().min(1).max(50).default(20),
    }),
    async execute({ query, workspace, count }) {
      const targets = workspace === undefined ? await slackWorkspaces() : [await workspaceFor(workspace)];
      if (targets.length === 0) throw new Error("Slack is not connected. Add a user token under Slack user tokens in the Assistant plugin settings.");
      const results = await Promise.all(targets.map((target) => searchSlack(target, query, count)));
      return JSON.stringify(results.flat());
    },
  });

  bb.agents.registerTool({
    name: "slack_thread",
    description: "Read a Slack thread by its workspace, channel id and parent message ts.",
    parameters: z.object({
      workspace: z.string(),
      channelId: z.string(),
      ts: z.string(),
    }),
    async execute({ workspace, channelId, ts }) {
      return readSlackThread(await workspaceFor(workspace), channelId, ts);
    },
  });

  bb.agents.registerTool({
    name: "email_search",
    description:
      "Search the inbox by subject, sender or body text. An empty query lists unread mail. Returns uid, sender, subject and date.",
    parameters: z.object({
      query: z.string().default(""),
      limit: z.number().int().min(1).max(50).default(20),
    }),
    async execute({ query, limit }) {
      return JSON.stringify(await searchEmail(await requireImap(), query, limit));
    },
  });

  bb.agents.registerTool({
    name: "email_read",
    description: "Read one email's headers and plain text body by uid. Does not mark it read.",
    parameters: z.object({ uid: z.number().int().positive() }),
    async execute({ uid }) {
      return readEmail(await requireImap(), uid);
    },
  });

  bb.agents.configure((context) =>
    context.thread.id === threadId
      ? {
          tools: ["assistant_notify", "slack_search", "slack_thread", "email_search", "email_read"],
          skills: [],
          instructions: assistantInstructions(context.thread.id),
        }
      : { tools: [], skills: [] },
  );

  bb.rpc.register(assistantRpcContract, {
    async "assistant.thread"() {
      return { threadId: await ensureThread() };
    },
    async "assistant.check"() {
      return checkSources();
    },
  });

  bb.background.schedule("check-sources", "*/10 * * * *", async () => {
    await checkSources();
  });

  bb.cli.register(
    defineCli({
      name: "assistant",
      summary: "Open the personal assistant thread and check Slack and email",
      commands: {
        thread: cliCommand({
          summary: "Print the assistant thread id, starting the thread if needed",
          async run() {
            return { exitCode: 0, stdout: await ensureThread() };
          },
        }),
        check: cliCommand({
          summary: "Check Slack and email now and send new items to the assistant",
          async run() {
            const { slack, email } = await checkSources();
            return { exitCode: 0, stdout: `${slack} Slack pings, ${email} emails sent to the assistant.` };
          },
        }),
      },
    }),
  );
}
