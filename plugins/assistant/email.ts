import { ImapFlow, type MessageStructureObject } from "imapflow";

export interface ImapAccount {
  host: string;
  port: number;
  user: string;
  password: string;
}

export interface EmailSummary {
  uid: number;
  from: string;
  subject: string;
  date: string;
  unread: boolean;
}

const MAX_BODY_CHARS = 20_000;

async function withInbox<T>(
  account: ImapAccount,
  run: (client: ImapFlow) => Promise<T>,
): Promise<T> {
  const client = new ImapFlow({
    host: account.host,
    port: account.port,
    secure: true,
    auth: { user: account.user, pass: account.password },
    logger: false,
  });
  await client.connect();
  try {
    const lock = await client.getMailboxLock("INBOX", { readOnly: true });
    try {
      return await run(client);
    } finally {
      lock.release();
    }
  } finally {
    await client.logout();
  }
}

async function summarize(
  client: ImapFlow,
  uids: number[],
): Promise<EmailSummary[]> {
  if (uids.length === 0) return [];
  const summaries: EmailSummary[] = [];
  for await (const message of client.fetch(
    uids,
    { uid: true, envelope: true, flags: true },
    { uid: true },
  )) {
    const sender = message.envelope?.from?.[0];
    summaries.push({
      uid: message.uid,
      from: sender
        ? `${sender.name ?? ""} <${sender.address ?? ""}>`.trim()
        : "unknown",
      subject: message.envelope?.subject ?? "(no subject)",
      date: message.envelope?.date?.toISOString() ?? "",
      unread: !message.flags?.has("\\Seen"),
    });
  }
  return summaries.sort((a, b) => b.uid - a.uid);
}

export function findTextPart(
  node: MessageStructureObject | undefined,
  type: "text/plain" | "text/html" = "text/plain",
): string | undefined {
  if (node === undefined) return undefined;
  if (node.type === type) return node.part ?? "1";
  for (const child of node.childNodes ?? []) {
    const part = findTextPart(child, type);
    if (part !== undefined) return part;
  }
  return undefined;
}

const HTML_ENTITIES: Record<string, string> = { nbsp: " ", amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", zwnj: "", zwj: "", shy: "" };

export function htmlToText(html: string): string {
  return html
    .replace(/<(style|script|head)\b[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>|<\/(p|div|tr|li|h[1-6]|table)>/gi, "\n")
    .replace(/<\/t[dh]>/gi, " ")
    .replace(/<[^>]+>/g, "")
    .replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (entity, code: string) => {
      if (code.startsWith("#x") || code.startsWith("#X")) return String.fromCodePoint(Number.parseInt(code.slice(2), 16));
      if (code.startsWith("#")) return String.fromCodePoint(Number(code.slice(1)));
      return HTML_ENTITIES[code.toLowerCase()] ?? entity;
    })
    .replace(/[\u200b-\u200d\u00ad\ufeff]/g, "")
    .split("\n")
    .map((line) => line.replace(/\s+/g, " ").trim())
    .filter((line) => line.length > 0)
    .join("\n");
}

export function latestUid(account: ImapAccount): Promise<number> {
  return withInbox(account, async (client) => {
    const mailbox = client.mailbox;
    return mailbox === false ? 0 : Number(mailbox.uidNext) - 1;
  });
}

export function fetchNewUnread(
  account: ImapAccount,
  afterUid: number,
): Promise<EmailSummary[]> {
  return withInbox(account, async (client) => {
    const uids = await client.search(
      { seen: false, uid: `${afterUid + 1}:*` },
      { uid: true },
    );
    return summarize(
      client,
      (uids || []).filter((uid) => uid > afterUid).slice(-50),
    );
  });
}

export function searchEmail(
  account: ImapAccount,
  query: string,
  limit: number,
): Promise<EmailSummary[]> {
  return withInbox(account, async (client) => {
    const uids = await client.search(
      query.length === 0
        ? { seen: false }
        : { or: [{ subject: query }, { from: query }, { body: query }] },
      { uid: true },
    );
    return summarize(client, (uids || []).slice(-limit));
  });
}

export function readEmail(account: ImapAccount, uid: number): Promise<string> {
  return withInbox(account, async (client) => {
    const message = await client.fetchOne(
      String(uid),
      { uid: true, envelope: true, bodyStructure: true },
      { uid: true },
    );
    if (message === false) return `No email with uid ${uid}.`;
    const plain = findTextPart(message.bodyStructure);
    const part = plain ?? findTextPart(message.bodyStructure, "text/html");
    let body = "(no text part)";
    if (part !== undefined) {
      const download = await client.download(String(uid), part, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of download.content) chunks.push(Buffer.from(chunk));
      const text = Buffer.concat(chunks).toString("utf8");
      body = (plain === undefined ? htmlToText(text) : text).slice(0, MAX_BODY_CHARS);
    }
    const sender = message.envelope?.from?.[0];
    return [
      `From: ${sender?.name ?? ""} <${sender?.address ?? ""}>`,
      `Subject: ${message.envelope?.subject ?? ""}`,
      `Date: ${message.envelope?.date?.toISOString() ?? ""}`,
      "",
      body,
    ].join("\n");
  });
}
