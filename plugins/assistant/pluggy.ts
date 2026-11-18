import { z } from "zod";

export interface PluggyClient {
  clientId: string;
  clientSecret: string;
}

const API_URL = "https://api.pluggy.ai";
const API_KEY_TTL_MS = 110 * 60_000;

export const pluggyAccountSchema = z.object({
  id: z.string(),
  itemId: z.string(),
  type: z.string(),
  subtype: z.string(),
  name: z.string(),
  marketingName: z.string().nullish(),
  number: z.string().nullish(),
  balance: z.number(),
  currencyCode: z.string(),
  creditData: z
    .object({
      creditLimit: z.number().nullish(),
      availableCreditLimit: z.number().nullish(),
      balanceDueDate: z.string().nullish(),
      minimumPayment: z.number().nullish(),
    })
    .nullish(),
});
export type PluggyAccount = z.infer<typeof pluggyAccountSchema>;

export const pluggyTransactionSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: z.string(),
  description: z.string(),
  amount: z.number(),
  amountInAccountCurrency: z.number().nullish(),
  currencyCode: z.string(),
  category: z.string().nullish(),
  status: z.string(),
  type: z.enum(["DEBIT", "CREDIT"]),
  operationType: z.string().nullish(),
  providerId: z.string().nullish(),
  paymentData: z
    .object({
      paymentMethod: z.string().nullish(),
      payer: z.object({ name: z.string().nullish() }).nullish(),
      receiver: z.object({ name: z.string().nullish() }).nullish(),
    })
    .nullish(),
  creditCardMetadata: z
    .object({
      installmentNumber: z.number().nullish(),
      totalInstallments: z.number().nullish(),
      billForecastDate: z.string().nullish(),
    })
    .nullish(),
});
export type PluggyTransaction = z.infer<typeof pluggyTransactionSchema>;

export const pluggyBillSchema = z.object({
  id: z.string(),
  dueDate: z.string(),
  billClosingDate: z.string().nullish(),
  totalAmount: z.number(),
  minimumPaymentAmount: z.number().nullish(),
  payments: z.array(z.object({ amount: z.number() })).nullish(),
});
export type PluggyBill = z.infer<typeof pluggyBillSchema>;

const authSchema = z.object({ apiKey: z.string() });
const pageSchema = <T extends z.ZodType>(item: T) => z.object({ results: z.array(item), next: z.string().nullish() });

let cachedKey: { clientId: string; apiKey: string; expiresAt: number } | null = null;

async function apiKey(client: PluggyClient): Promise<string> {
  if (cachedKey !== null && cachedKey.clientId === client.clientId && cachedKey.expiresAt > Date.now()) return cachedKey.apiKey;
  const response = await fetch(`${API_URL}/auth`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ clientId: client.clientId, clientSecret: client.clientSecret }),
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Pluggy sign-in answered HTTP ${response.status}: ${(await response.text()).slice(0, 300)}`);
  const { apiKey: key } = authSchema.parse(await response.json());
  cachedKey = { clientId: client.clientId, apiKey: key, expiresAt: Date.now() + API_KEY_TTL_MS };
  return key;
}

async function get<T>(client: PluggyClient, path: string, schema: z.ZodType<T>): Promise<T> {
  const response = await fetch(`${API_URL}${path}`, {
    headers: { "x-api-key": await apiKey(client) },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) throw new Error(`Pluggy answered HTTP ${response.status} for ${path.split("?")[0]}: ${(await response.text()).slice(0, 300)}`);
  return schema.parse(await response.json());
}

export async function pluggyAccounts(client: PluggyClient, itemIds: readonly string[]): Promise<PluggyAccount[]> {
  const perItem = await Promise.all(
    itemIds.map(async (itemId) => (await get(client, `/accounts?itemId=${encodeURIComponent(itemId)}`, pageSchema(pluggyAccountSchema))).results),
  );
  return perItem.flat();
}

export async function pluggyTransactions(client: PluggyClient, accountId: string, dateFrom: string): Promise<PluggyTransaction[]> {
  const rows: PluggyTransaction[] = [];
  let query: string | null = `?${new URLSearchParams({ accountId, dateFrom })}`;
  while (query !== null) {
    const page: { results: PluggyTransaction[]; next?: string | null } = await get(client, `/v2/transactions${query}`, pageSchema(pluggyTransactionSchema));
    rows.push(...page.results);
    query = page.next ?? null;
  }
  return rows;
}

export async function pluggyBills(client: PluggyClient, accountId: string): Promise<PluggyBill[]> {
  return (await get(client, `/bills?${new URLSearchParams({ accountId, pageSize: "500" })}`, pageSchema(pluggyBillSchema))).results;
}
