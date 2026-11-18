import { describe, expect, it } from "vitest";
import { brazilDay, committedMonths, flagCharge, recurringCharges, spendSummary, toTxn, type Txn } from "./finance.js";
import type { PluggyAccount, PluggyTransaction } from "./pluggy.js";

const card: PluggyAccount = { id: "card", itemId: "i", type: "CREDIT", subtype: "CREDIT_CARD", name: "Nubank", number: "1234", balance: 0, currencyCode: "BRL" };
const checking: PluggyAccount = { id: "bank", itemId: "i", type: "BANK", subtype: "CHECKING_ACCOUNT", name: "Conta", balance: 0, currencyCode: "BRL" };

function raw(overrides: Partial<PluggyTransaction>): PluggyTransaction {
  return { id: "t", accountId: "card", date: "2026-11-10T00:00:00.000Z", description: "X", amount: 10, currencyCode: "BRL", status: "POSTED", type: "DEBIT", ...overrides };
}

let next = 0;
function txn(overrides: Partial<Txn>): Txn {
  next += 1;
  return {
    key: `k${next}`,
    account: "Nubank 1234",
    card: true,
    day: "2026-11-10",
    description: "X",
    merchant: "x",
    value: -10,
    currency: "BRL",
    category: "Shopping",
    pending: false,
    installment: null,
    billMonth: null,
    method: null,
    counterparty: null,
    ...overrides,
  };
}

describe("toTxn", () => {
  it("signs by type, keeps date-only days, and reads installments and the Pix receiver", () => {
    const purchase = toTxn(
      raw({ amount: 300, creditCardMetadata: { installmentNumber: 2, totalInstallments: 10, billForecastDate: "2026-12-05" } }),
      card,
    );
    expect(purchase).toMatchObject({ value: -300, day: "2026-11-10", installment: { number: 2, total: 10 }, billMonth: "2026-12", card: true });

    const pix = toTxn(
      raw({ accountId: "bank", date: "2026-11-10T01:30:00.000Z", amount: -50, paymentData: { paymentMethod: "PIX", receiver: { name: "Ana Souza" } } }),
      checking,
    );
    expect(pix).toMatchObject({ value: -50, day: "2026-11-09", merchant: "ana souza", method: "PIX" });

    expect(toTxn(raw({ type: "CREDIT", amount: -5000 }), checking).value).toBe(5000);
  });

  it("uses the amount in reais for foreign purchases", () => {
    expect(toTxn(raw({ amount: 20, amountInAccountCurrency: 110.4, currencyCode: "USD" }), card).value).toBe(-110.4);
  });
});

describe("brazilDay", () => {
  it("shifts timed instants to São Paulo and leaves midnight dates alone", () => {
    expect(brazilDay("2026-11-10T00:00:00.000Z")).toBe("2026-11-10");
    expect(brazilDay("2026-11-10T02:00:00.000Z")).toBe("2026-11-09");
  });
});

describe("spendSummary", () => {
  it("leaves out fatura payments, own transfers and investments", () => {
    const summary = spendSummary(
      [
        txn({ value: -100, category: "Groceries", merchant: "pao de acucar" }),
        txn({ value: -40, category: "Groceries", merchant: "pao de acucar" }),
        txn({ value: -2000, card: false, category: "Credit card payment" }),
        txn({ value: -500, card: false, category: "Same person transfer - PIX" }),
        txn({ value: -900, card: false, category: "Fixed income" }),
        txn({ value: 8000, card: false, category: "Salary" }),
        txn({ value: 2000, card: true, method: "PAGAMENTO_FATURA" }),
        txn({ value: -60, day: "2026-10-01", category: "Groceries" }),
      ],
      "2026-11-01",
      "2026-11-30",
    );
    expect(summary).toMatchObject({ spent: 140, income: 8000, byCategory: [{ name: "Groceries", total: 140, count: 2 }] });
  });
});

describe("committedMonths", () => {
  it("sums pending card spending per fatura month from this month on", () => {
    expect(
      committedMonths(
        [
          txn({ pending: true, value: -100, billMonth: "2026-12" }),
          txn({ pending: true, value: -100, billMonth: "2027-01" }),
          txn({ pending: true, value: -50, billMonth: null, day: "2026-11-15" }),
          txn({ pending: true, value: -70, billMonth: "2026-10" }),
          txn({ pending: false, value: -999, billMonth: "2026-12" }),
          txn({ pending: true, card: false, value: -300, billMonth: null, day: "2026-12-01" }),
        ],
        "2026-11-18",
      ),
    ).toEqual([
      { month: "2026-11", total: 50 },
      { month: "2026-12", total: 100 },
      { month: "2027-01", total: 100 },
    ]);
  });
});

describe("recurringCharges", () => {
  it("finds monthly charges, flags a price increase, and marks one that stopped", () => {
    const netflix = ["2026-07-05", "2026-08-05", "2026-09-05", "2026-10-05"].map((day) => txn({ merchant: "netflix", day, value: -39.9 }));
    const raised = txn({ merchant: "netflix", day: "2026-11-05", value: -44.9 });
    const gym = ["2026-06-10", "2026-07-10", "2026-08-10"].map((day) => txn({ merchant: "smartfit", day, value: -119.9 }));
    const uber = ["2026-09-02", "2026-10-11", "2026-11-03"].map((day, index) => txn({ merchant: "uber", day, value: -[12, 80, 31][index]! }));
    const found = recurringCharges([...netflix, raised, ...gym, ...uber], "2026-11-18");
    expect(found.map((charge) => charge.merchant).sort()).toEqual(["netflix", "smartfit"]);
    expect(found.find((charge) => charge.merchant === "netflix")).toMatchObject({ amount: 44.9, previous: 39.9, priceChange: 12.53, stopped: false });
    expect(found.find((charge) => charge.merchant === "smartfit")).toMatchObject({ stopped: true, priceChange: null });
  });
});

describe("flagCharge", () => {
  const history = [
    txn({ merchant: "ifood", day: "2026-10-01", value: -50, category: "Food delivery" }),
    ...Array.from({ length: 5 }, (_, index) => txn({ merchant: "padaria", day: `2026-10-1${index}`, value: -30, category: "Eating out" })),
  ];

  it("flags a duplicate within two days and a first charge from a new merchant", () => {
    const first = txn({ merchant: "loja nova", day: "2026-11-10", value: -80 });
    const again = txn({ merchant: "loja nova", day: "2026-11-11", value: -80 });
    expect(flagCharge(again, [...history, first, again])).toEqual(["possible duplicate"]);
    expect(flagCharge(first, [...history, first])).toEqual(["first charge from this merchant"]);
  });

  it("flags large charges against the category median, foreign currency and long installment plans", () => {
    const dinner = txn({ merchant: "padaria", day: "2026-11-10", value: -200, category: "Eating out" });
    expect(flagCharge(dinner, [...history, dinner])).toEqual(["unusually large"]);
    const trip = txn({ merchant: "ifood", day: "2026-11-10", value: -40, currency: "USD", installment: { number: 1, total: 10 } });
    expect(flagCharge(trip, [...history, trip])).toEqual(["foreign currency USD, IOF applies", "split into 10 installments"]);
  });

  it("ignores later parcelas of the same purchase and money coming in", () => {
    const parcela = txn({ merchant: "ifood", day: "2026-11-10", value: -50, installment: { number: 3, total: 4 } });
    const sibling = txn({ merchant: "ifood", day: "2026-11-10", value: -50, installment: { number: 4, total: 4 } });
    expect(flagCharge(parcela, [...history, parcela, sibling])).toEqual([]);
    expect(flagCharge(txn({ value: 100 }), history)).toEqual([]);
  });
});
