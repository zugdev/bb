import { randomUUID } from "node:crypto";
import { cliCommand, defineCli, type BbPluginApi } from "@get-bb/plugin-sdk";
import { z } from "zod";
import { assistantRpcContract } from "./contract.js";
import {
  completeTodo,
  openTodos,
  todoSchema,
  upcomingReminders,
  type Todo,
} from "./home.js";
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
const UNSEEN_KEY = "unseen";
const TODOS_KEY = "todos";
const PANEL_KEY = "assistant/assistant";
const BUILT_IN_NAVIGATION_KEYS = [
  "__bb__/new-thread",
  "__bb__/search-threads",
  "__bb__/extensions",
  "__bb__/skills",
  "__bb__/automations",
];
const EMAIL_UID_KEY = "email:lastUid";
const slackSinceKey = (team: string) => `slack:${team}:since`;

const automationListOutputSchema = z.array(z.unknown());

const notificationOutputSchema = z.object({
  ok: z.literal(true),
  channels: z.array(z.enum(["web", "desktop", "mobile"])),
});

function assistantInstructions(threadId: string): string {
  return `You are the user's personal assistant: their secretary and the orchestrator of their other bb agents. You live in one special thread (id ${threadId}) that the user opens from the Assistant entry at the top of the bb sidebar.
1. Triage. bb posts new Slack mentions, DMs and unread emails here as they arrive. Sort each batch into needs the user now, needs a reply later, and FYI, one line per FYI item. Use slack_search, slack_thread, email_search and email_read for context first.
2. Notify. Call assistant_notify when something needs the user soon: a direct question, a deadline today, a meeting about to start, someone blocked on them, or a work thread you started that finished or failed. Each call also bumps the count on the Assistant sidebar entry. Never notify for newsletters, automated mail or FYI.
3. Calendar. Use the Google Calendar connector tools when they are loaded and add events the user asks for directly. If they are missing, tell the user to connect Google Calendar under claude.ai Settings, Connectors.
4. To-dos. Anything the user has to do themselves, such as "pay rent" or "call Ana", is a to-do: call todo_add with a short title in the language the user wrote in, plus dueAt when it has a date. To-dos stay on the bb home page with a checkbox until the user or todo_done checks them off. When a to-do also needs a nudge at a time, add a one off automation for the notification too. Read todo_list before adding so you never add one twice.
5. Schedule. For anything recurring or later ("check my email every day at 9am", "remind me Friday"), run \`bb automation create --project proj_personal --target-thread ${threadId} --name <name> --cron "<cron>" --timezone <IANA zone> --prompt "<task>" --provider <your provider id> --model <your model>\`, or \`--at <ISO time>\` or \`--in <duration>\` for one off reminders. The name shows on the bb home page, so write it as a short title in the language the user wrote in, such as "Pay rent", never a slug. \`bb automation list --project proj_personal\` shows them.
6. Orchestrate. You may start work in any project when the user asks: \`bb project list --json\` for ids, then \`bb thread spawn --project <id> --new-environment worktree --prompt-file -\` for code work, \`bb thread wait <id>\` and \`bb thread output <id>\` to follow it, \`bb thread tell <id>\` to steer it. Keep a short ledger in your replies of threads you started and their state, and notify when one needs the user.
7. Memory. You own the user's long term memory. Search it with \`bb memory search <words> --scope all\` before answering questions about people, projects or preferences, and save durable facts with \`bb memory add --scope global\`: people and how the user works with them, their timezone, routines and preferences.
8. You never send Slack messages or email. When a reply is due, write a draft for the user to copy.`;
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
        if (thread.archivedAt === null && thread.visibility === "hidden") return threadId;
        if (thread.archivedAt === null) await bb.sdk.threads.archive({ threadId });
      } catch (error) {
        bb.log.info(`assistant thread ${threadId} is gone, starting a new one: ${String(error)}`);
      }
    }
    const thread = await bb.sdk.threads.spawn({
      projectId: PERSONAL_PROJECT_ID,
      environment: { type: "project-default" },
      title: "Assistant",
      visibility: "hidden",
      prompt:
        "Say hello in one line, then tell me which of Slack and email are connected and what I should set up next.",
    });
    threadId = thread.id;
    await bb.storage.kv.set(THREAD_KEY, thread.id);
    return thread.id;
  }

  async function bumpUnseen(by: number): Promise<void> {
    const unseen = (await bb.storage.kv.get<number>(UNSEEN_KEY)) ?? 0;
    await bb.storage.kv.set(UNSEEN_KEY, unseen + by);
    bb.rpc.experimental_invalidate(["badge"]);
  }

  async function readTodos(): Promise<Todo[]> {
    const parsed = todoSchema.array().safeParse(await bb.storage.kv.get<unknown>(TODOS_KEY));
    return parsed.success ? parsed.data : [];
  }

  async function writeTodos(todos: Todo[]): Promise<void> {
    await bb.storage.kv.set(TODOS_KEY, todos);
    bb.rpc.experimental_invalidate(["home"]);
  }

  async function addTodo(title: string, dueAt: number | null): Promise<Todo> {
    const todo: Todo = { id: randomUUID().slice(0, 8), title, dueAt, doneAt: null };
    await writeTodos([...(await readTodos()), todo]);
    return todo;
  }

  async function finishTodo(id: string): Promise<void> {
    await writeTodos(completeTodo(await readTodos(), id, Date.now()));
  }

  async function assistantReminders() {
    if (threadId === undefined) return [];
    try {
      const rows = await bb.sdk.plugins.callRpc({
        pluginId: "automations",
        method: "automations_list",
        input: { targetThreadId: threadId },
        outputSchema: automationListOutputSchema,
      });
      return upcomingReminders(rows, Date.now());
    } catch (error) {
      bb.log.warn(`could not list the assistant's reminders: ${String(error)}`);
      return [];
    }
  }

  async function finishReminder(automationId: string): Promise<void> {
    await bb.sdk.plugins.callRpc({
      pluginId: "automations",
      method: "automations_pause",
      input: { projectId: PERSONAL_PROJECT_ID, automationId },
      outputSchema: z.unknown(),
    });
    bb.rpc.experimental_invalidate(["home"]);
  }

  async function placeAtTopOfSidebar(): Promise<void> {
    const preferences = await bb.sdk.system.uiPreferences.list();
    const order = preferences.preferences["sidebar.pluginPanelOrder"];
    const current = order.value;
    if (current[0] !== PANEL_KEY) {
      const rest = current.filter((key) => key !== PANEL_KEY);
      const missingBuiltIns = BUILT_IN_NAVIGATION_KEYS.filter((key) => !rest.includes(key));
      await bb.sdk.system.uiPreferences.set({
        key: "sidebar.pluginPanelOrder",
        expectedRevision: order.revision,
        value: [PANEL_KEY, ...missingBuiltIns, ...rest],
      });
    }
    const provider = preferences.preferences["sidebar.navigationProvider"];
    if (provider.value !== "navigation/top-list") {
      await bb.sdk.system.uiPreferences.set({
        key: "sidebar.navigationProvider",
        expectedRevision: provider.revision,
        value: "navigation/top-list",
      });
    }
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
      await bumpUnseen(1);
      return result.channels.length === 0
        ? "No notification channel is enabled, so nothing was delivered."
        : `Delivered to ${result.channels.join(", ")}.`;
    },
  });

  bb.agents.registerTool({
    name: "todo_add",
    description:
      "Add a to-do the user has to do themselves. It shows on the bb home page with a checkbox until it is done.",
    parameters: z.object({
      title: z.string().min(1).max(80),
      dueAt: z.string().datetime({ offset: true }).optional(),
    }),
    async execute({ title, dueAt }) {
      const todo = await addTodo(title, dueAt === undefined ? null : Date.parse(dueAt));
      return `Added to-do ${todo.id}.`;
    },
  });

  bb.agents.registerTool({
    name: "todo_done",
    description: "Check off a to-do by its id from todo_list.",
    parameters: z.object({ id: z.string() }),
    async execute({ id }) {
      await finishTodo(id);
      return `Checked off ${id}.`;
    },
  });

  bb.agents.registerTool({
    name: "todo_list",
    description: "List open to-dos and those checked off in the last week, with ids and due times.",
    parameters: z.object({}),
    async execute() {
      return JSON.stringify(await readTodos());
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
          tools: ["assistant_notify", "todo_add", "todo_done", "todo_list", "slack_search", "slack_thread", "email_search", "email_read"],
          skills: [],
          instructions: assistantInstructions(context.thread.id),
        }
      : { tools: [], skills: [] },
  );

  bb.events.on("thread.idle", ({ thread }) => {
    if (thread.id === threadId) bb.rpc.experimental_invalidate(["home"]);
  });

  bb.rpc.register(assistantRpcContract, {
    async "assistant.thread"() {
      return { threadId: await ensureThread() };
    },
    async "assistant.home"() {
      return {
        todos: openTodos(await readTodos()),
        reminders: await assistantReminders(),
      };
    },
    async "assistant.todoDone"({ id }) {
      await finishTodo(id);
      return { ok: true as const };
    },
    async "assistant.reminderDone"({ id }) {
      await finishReminder(id);
      return { ok: true as const };
    },
    async "assistant.check"() {
      return checkSources();
    },
    async "assistant.badge"() {
      return { unseen: (await bb.storage.kv.get<number>(UNSEEN_KEY)) ?? 0 };
    },
    async "assistant.seen"() {
      await bb.storage.kv.set(UNSEEN_KEY, 0);
      bb.rpc.experimental_invalidate(["badge"]);
      return { unseen: 0 };
    },
  });

  await placeAtTopOfSidebar().catch((error: unknown) => {
    bb.log.warn(`could not place Assistant at the top of the sidebar: ${String(error)}`);
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
        todos: cliCommand({
          summary: "List open to-dos",
          async run() {
            const todos = openTodos(await readTodos());
            const lines = todos.map(
              (todo) => `${todo.id}  ${todo.title}${todo.dueAt === null ? "" : `  due ${new Date(todo.dueAt).toISOString()}`}`,
            );
            return { exitCode: 0, stdout: lines.length === 0 ? "No open to-dos." : lines.join("\n") };
          },
        }),
        "todo-add": cliCommand({
          summary: "Add a to-do to the home page",
          positionals: [{ name: "title", description: "What to do", required: true }],
          options: { due: { type: "string", description: "Due time as an ISO date, for example 2026-12-01T09:00-03:00" } },
          async run(input) {
            const dueAt = input.options.due === undefined ? null : Date.parse(input.options.due);
            if (Number.isNaN(dueAt)) return { exitCode: 1, stderr: `Not a date: ${input.options.due}` };
            const todo = await addTodo(input.positionals.title, dueAt);
            return { exitCode: 0, stdout: todo.id };
          },
        }),
        "todo-done": cliCommand({
          summary: "Check off a to-do by id",
          positionals: [{ name: "id", description: "To-do id from bb assistant todos", required: true }],
          async run(input) {
            await finishTodo(input.positionals.id);
            return { exitCode: 0, stdout: `Checked off ${input.positionals.id}.` };
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
