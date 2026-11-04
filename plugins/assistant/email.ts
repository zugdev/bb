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
): string | undefined {
  if (node === undefined) return undefined;
  if (node.type === "text/plain") return node.part ?? "1";
  for (const child of node.childNodes ?? []) {
    const part = findTextPart(child);
    if (part !== undefined) return part;
  }
  return undefined;
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
    const part = findTextPart(message.bodyStructure);
    let body = "(no plain text part)";
    if (part !== undefined) {
      const download = await client.download(String(uid), part, { uid: true });
      const chunks: Buffer[] = [];
      for await (const chunk of download.content) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks).toString("utf8").slice(0, MAX_BODY_CHARS);
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
