import { readdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
import { makeTxn, type Txn } from "./finance.js";

export interface StatementAccount {
  label: string;
  card: boolean;
  balance: number | null;
  balanceDay: string | null;
}

export interface Statement {
  account: StatementAccount;
  txns: Txn[];
}

const BANKS: Record<string, string> = { "260": "Nubank", "341": "Itaú" };

function ofxTag(block: string, tag: string): string | null {
  const match = new RegExp(`<${tag}>([^<\\r\\n]*)`, "i").exec(block);
  return match === null ? null : match[1]!.trim();
}

function ofxDay(value: string): string {
  return `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
}

function ofxAmount(value: string): number {
  return Number(value.replace(",", "."));
}

function decodeOfx(bytes: Uint8Array): string {
  const head = new TextDecoder("latin1").decode(bytes.slice(0, 400));
  const utf8 = /ENCODING:\s*UTF-8|encoding="utf-8"/i.test(head) && !/CHARSET:\s*1252/i.test(head);
  return new TextDecoder(utf8 ? "utf-8" : "windows-1252").decode(bytes);
}

export function parseOfx(bytes: Uint8Array): Statement {
  const text = decodeOfx(bytes);
  const card = /<CCSTMTRS>/i.test(text);
  const bankId = (ofxTag(text, "BANKID") ?? "").replace(/^0+/, "");
  const bank = BANKS[bankId] ?? ofxTag(text, "ORG") ?? (bankId || "Banco");
  const accountId = ofxTag(text, "ACCTID") ?? "";
  const label = `${bank} ${card ? "cartão" : "conta"}${accountId ? ` ${accountId.replace(/\W/g, "").slice(-4)}` : ""}`;
  const blocks = text.split(/<STMTTRN>/i).slice(1);
  const days = blocks.map((block) => ofxDay(ofxTag(block, "DTPOSTED") ?? ""));
  const end = ofxTag(text, "DTEND");
  const billMonth = card ? (end === null ? [...days].sort().at(-1)?.slice(0, 7) ?? null : ofxDay(end).slice(0, 7)) : null;
  const txns = blocks.map((block, index) => {
    const description = ofxTag(block, "MEMO") || ofxTag(block, "NAME") || "";
    const value = ofxAmount(ofxTag(block, "TRNAMT") ?? "0");
    const fitId = ofxTag(block, "FITID");
    return makeTxn({
      key: `${label}|${fitId ?? `${days[index]}|${value}|${description}|${index}`}`,
      account: label,
      card,
      day: days[index]!,
      description,
      value,
      billMonth,
    });
  });
  const ledger = /<LEDGERBAL>([\s\S]*?)(<\/LEDGERBAL>|<AVAILBAL>|$)/i.exec(text)?.[1] ?? null;
  const balance = card || ledger === null ? null : ofxTag(ledger, "BALAMT");
  const asOf = ledger === null ? null : ofxTag(ledger, "DTASOF");
  return {
    account: { label, card, balance: balance === null ? null : ofxAmount(balance), balanceDay: card || asOf === null ? null : ofxDay(asOf) },
    txns,
  };
}

function csvRows(text: string): string[][] {
  const rows: string[][] = [];
  for (const line of text.split(/\r?\n/)) {
    if (line.trim() === "") continue;
    const cells: string[] = [];
    let cell = "";
    let quoted = false;
    for (const char of line) {
      if (char === '"') quoted = !quoted;
      else if (char === "," && !quoted) {
        cells.push(cell);
        cell = "";
      } else cell += char;
    }
    cells.push(cell);
    rows.push(cells.map((value) => value.trim()));
  }
  return rows;
}

export function parseNubankCsv(text: string, fileName: string): Statement | null {
  const [header, ...rows] = csvRows(text.replace(/^﻿/, ""));
  const columns = (header ?? []).map((name) => name.toLowerCase());
  if (columns[0] === "date" && columns.includes("title") && columns.includes("amount")) {
    const title = columns.indexOf("title");
    const amount = columns.indexOf("amount");
    const closing = /(\d{4}-\d{2})-\d{2}/.exec(fileName)?.[1] ?? null;
    const billMonth = closing ?? rows.map((row) => row[0]!.slice(0, 7)).sort().at(-1) ?? null;
    const label = "Nubank cartão";
    return {
      account: { label, card: true, balance: null, balanceDay: null },
      txns: rows.map((row, index) =>
        makeTxn({
          key: `${label}|${row[0]}|${row[amount]}|${row[title]}|${index}`,
          account: label,
          card: true,
          day: row[0]!,
          description: row[title] ?? "",
          value: -Number(row[amount]),
          billMonth,
        }),
      ),
    };
  }
  if (columns[0] === "data" && columns.includes("valor") && columns.includes("identificador")) {
    const value = columns.indexOf("valor");
    const id = columns.indexOf("identificador");
    const description = columns.findIndex((name) => name.startsWith("descri"));
    const label = "Nubank conta";
    return {
      account: { label, card: false, balance: null, balanceDay: null },
      txns: rows.map((row) => {
        const [day, month, year] = row[0]!.split("/");
        return makeTxn({
          key: `${label}|${row[id]}`,
          account: label,
          card: false,
          day: `${year}-${month}-${day}`,
          description: row[description] ?? "",
          value: Number(row[value]),
          billMonth: null,
        });
      }),
    };
  }
  return null;
}

export function expandHome(path: string): string {
  return path.startsWith("~/") ? join(homedir(), path.slice(2)) : path;
}

export async function loadStatements(folder: string, warn: (message: string) => void) {
  const entries = await readdir(folder).catch((error: NodeJS.ErrnoException) => {
    if (error.code === "ENOENT") return [];
    throw error;
  });
  const names = entries.filter((name) => /\.(ofx|csv)$/i.test(name)).sort();
  const accounts = new Map<string, StatementAccount>();
  const txns = new Map<string, Txn>();
  for (const name of names) {
    try {
      const bytes = await readFile(join(folder, name));
      const statement = /\.ofx$/i.test(name) ? parseOfx(bytes) : parseNubankCsv(new TextDecoder().decode(bytes), name);
      if (statement === null) {
        warn(`skipped ${name}: not a Nubank CSV export`);
        continue;
      }
      const known = accounts.get(statement.account.label);
      if (known === undefined || (statement.account.balanceDay ?? "") >= (known.balanceDay ?? "")) {
        accounts.set(statement.account.label, statement.account.balance === null && known !== undefined ? known : statement.account);
      }
      for (const txn of statement.txns) txns.set(txn.key, txn);
    } catch (error) {
      warn(`could not read ${name}: ${String(error)}`);
    }
  }
  return { accounts: [...accounts.values()], txns: [...txns.values()].sort((a, b) => b.day.localeCompare(a.day)) };
}
