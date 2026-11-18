import type { PluggyAccount, PluggyTransaction } from "./pluggy.js";

export interface Txn {
  key: string;
  account: string;
  card: boolean;
  day: string;
  description: string;
  merchant: string;
  value: number;
  currency: string;
  category: string | null;
  pending: boolean;
  installment: { number: number; total: number } | null;
  billMonth: string | null;
  method: string | null;
  counterparty: string | null;
}

const BRAZIL_DAY = new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo" });
const INTERNAL_CATEGORIES = new Set([
  "Credit card payment",
  "Same person transfer",
  "Same person transfer - Cash",
  "Same person transfer - PIX",
  "Same person transfer - TED",
  "Investments",
  "Automatic investment",
  "Fixed income",
  "Mutual funds",
  "Variable income",
  "Margin",
  "Pension",
]);
const INTERNAL_OPERATIONS = new Set(["PAGAMENTO_FATURA", "PAGAMENTO"]);
const LARGE_CHARGE = 1000;
const MANY_INSTALLMENTS = 6;
const DAY_MS = 86_400_000;

export function brazilDay(iso: string): string {
  if (/T00:00:00(\.000)?Z$/.test(iso)) return iso.slice(0, 10);
  return BRAZIL_DAY.format(new Date(iso));
}

export function merchantName(description: string): string {
  return description
    .toLowerCase()
    .replace(/\b(parc(ela)?|pg|pag)\b/g, " ")
    .replace(/[^a-zà-ú]+/g, " ")
    .trim()
    .replace(/\s+/g, " ");
}

export function accountLabel(account: PluggyAccount): string {
  const name = account.marketingName ?? account.name;
  return account.number ? `${name} ${account.number.slice(-4)}` : name;
}

export function toTxn(raw: PluggyTransaction, account: PluggyAccount): Txn {
  const amount = Math.abs(raw.amountInAccountCurrency ?? raw.amount);
  const card = account.subtype === "CREDIT_CARD";
  const value = raw.type === "DEBIT" ? -amount : amount;
  const day = brazilDay(raw.date);
  const metadata = raw.creditCardMetadata;
  const installment =
    metadata?.installmentNumber != null && metadata.totalInstallments != null && metadata.totalInstallments > 1
      ? { number: metadata.installmentNumber, total: metadata.totalInstallments }
      : null;
  const counterparty = value < 0 ? raw.paymentData?.receiver?.name : raw.paymentData?.payer?.name;
  return {
    key: raw.providerId ?? `${raw.accountId}|${day}|${value}|${raw.description}`,
    account: accountLabel(account),
    card,
    day,
    description: raw.description,
    merchant: merchantName(counterparty ?? raw.description),
    value: Math.round(value * 100) / 100,
    currency: raw.currencyCode,
    category: raw.category ?? null,
    pending: raw.status === "PENDING",
    installment,
    billMonth: metadata?.billForecastDate ? metadata.billForecastDate.slice(0, 7) : null,
    method: raw.paymentData?.paymentMethod ?? raw.operationType ?? null,
    counterparty: counterparty ?? null,
  };
}

export function isInternal(txn: Txn): boolean {
  return (
    (txn.category !== null && INTERNAL_CATEGORIES.has(txn.category)) ||
    (txn.method !== null && INTERNAL_OPERATIONS.has(txn.method))
  );
}

export function isSpending(txn: Txn): boolean {
  return txn.value < 0 && !isInternal(txn);
}

const round = (value: number) => Math.round(value * 100) / 100;

function totals(rows: readonly Txn[], keyOf: (txn: Txn) => string) {
  const groups = new Map<string, { total: number; count: number }>();
  for (const txn of rows) {
    const key = keyOf(txn);
    const group = groups.get(key) ?? { total: 0, count: 0 };
    group.total -= txn.value;
    group.count += 1;
    groups.set(key, group);
  }
  return [...groups]
    .map(([name, group]) => ({ name, total: round(group.total), count: group.count }))
    .sort((a, b) => b.total - a.total);
}

export function spendSummary(txns: readonly Txn[], from: string, to: string) {
  const inRange = txns.filter((txn) => txn.day >= from && txn.day <= to);
  const spending = inRange.filter(isSpending);
  const income = inRange.filter((txn) => txn.value > 0 && !txn.card && !isInternal(txn));
  return {
    from,
    to,
    spent: round(-spending.reduce((sum, txn) => sum + txn.value, 0)),
    income: round(income.reduce((sum, txn) => sum + txn.value, 0)),
    byCategory: totals(spending, (txn) => txn.category ?? "Uncategorized"),
    topMerchants: totals(spending, (txn) => txn.merchant).slice(0, 10),
  };
}

export function committedMonths(txns: readonly Txn[], today: string) {
  const thisMonth = today.slice(0, 7);
  const months = new Map<string, number>();
  for (const txn of txns) {
    if (!txn.card || !txn.pending || !isSpending(txn)) continue;
    const month = txn.billMonth ?? txn.day.slice(0, 7);
    if (month < thisMonth) continue;
    months.set(month, (months.get(month) ?? 0) - txn.value);
  }
  return [...months].sort(([a], [b]) => a.localeCompare(b)).map(([month, total]) => ({ month, total: round(total) }));
}

function median(values: readonly number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2;
}

function daysBetween(a: string, b: string): number {
  return Math.abs(Date.parse(a) - Date.parse(b)) / DAY_MS;
}

export interface RecurringCharge {
  merchant: string;
  account: string;
  amount: number;
  previous: number;
  lastDay: string;
  months: number;
  priceChange: number | null;
  stopped: boolean;
}

export function recurringCharges(txns: readonly Txn[], today: string): RecurringCharge[] {
  const groups = new Map<string, Txn[]>();
  for (const txn of txns) {
    if (!isSpending(txn) || txn.installment !== null || txn.pending) continue;
    groups.set(txn.merchant, [...(groups.get(txn.merchant) ?? []), txn]);
  }
  const found: RecurringCharge[] = [];
  for (const [merchant, rows] of groups) {
    const byMonth = new Map<string, Txn>();
    for (const txn of rows.sort((a, b) => a.day.localeCompare(b.day))) byMonth.set(txn.day.slice(0, 7), txn);
    const monthly = [...byMonth.values()];
    if (monthly.length < 3) continue;
    const amounts = monthly.map((txn) => -txn.value);
    const typical = median(amounts);
    if (amounts.filter((amount) => Math.abs(amount - typical) <= typical * 0.25).length < 3) continue;
    const last = monthly.at(-1)!;
    const previous = -monthly.at(-2)!.value;
    const amount = -last.value;
    const increased = amount > previous * 1.05 && amount - previous > 2;
    found.push({
      merchant,
      account: last.account,
      amount,
      previous,
      lastDay: last.day,
      months: monthly.length,
      priceChange: increased ? round(((amount - previous) / previous) * 100) : null,
      stopped: daysBetween(today, last.day) > 40,
    });
  }
  return found.sort((a, b) => b.amount - a.amount);
}

export function flagCharge(txn: Txn, history: readonly Txn[]): string[] {
  if (!isSpending(txn)) return [];
  const flags: string[] = [];
  const others = history.filter((other) => other.key !== txn.key);
  const amount = -txn.value;
  if (
    txn.installment === null &&
    others.some((other) => other.merchant === txn.merchant && other.value === txn.value && other.installment === null && daysBetween(other.day, txn.day) <= 2)
  ) {
    flags.push("possible duplicate");
  }
  if (!others.some((other) => other.merchant === txn.merchant && other.day < txn.day)) flags.push("first charge from this merchant");
  if (txn.currency !== "BRL") flags.push(`foreign currency ${txn.currency}, IOF applies`);
  const sameCategory = others.filter((other) => isSpending(other) && other.category === txn.category).map((other) => -other.value);
  if (amount >= LARGE_CHARGE || (sameCategory.length >= 5 && amount >= 100 && amount >= 3 * median(sameCategory))) flags.push("unusually large");
  if (txn.installment !== null && txn.installment.number === 1 && txn.installment.total >= MANY_INSTALLMENTS) {
    flags.push(`split into ${txn.installment.total} installments`);
  }
  return flags;
}

export function describeTxn(txn: Txn): string {
  const parts = [
    txn.day,
    txn.account,
    `R$ ${txn.value.toFixed(2)}`,
    txn.description,
    txn.category ?? "Uncategorized",
    txn.installment === null ? null : `parcela ${txn.installment.number}/${txn.installment.total}`,
    txn.pending ? "pending" : null,
  ];
  return parts.filter((part) => part !== null).join(" | ");
}
