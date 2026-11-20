import { describe, expect, it } from "vitest";
import { committedMonths, flagCharge, parseInstallment, recurringCharges, spendSummary, type Txn } from "./finance.js";

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

describe("parseInstallment", () => {
  it("reads Nubank and Itaú installment suffixes and ignores lone numbers", () => {
    expect(parseInstallment("Amazon - Parcela 3/10")).toEqual({ number: 3, total: 10 });
    expect(parseInstallment("MAGAZINE LUIZA 02/12")).toEqual({ number: 2, total: 12 });
    expect(parseInstallment("PARC 1 DE 6 FAST SHOP")).toEqual({ number: 1, total: 6 });
    expect(parseInstallment("Uber 99/1")).toBeNull();
    expect(parseInstallment("Padaria 1/1")).toBeNull();
    expect(parseInstallment("Netflix")).toBeNull();
  });
});

describe("spendSummary", () => {
  it("leaves out fatura payments and investments", () => {
    const summary = spendSummary(
      [
        txn({ value: -100, merchant: "pao de acucar" }),
        txn({ value: -40, merchant: "pao de acucar" }),
        txn({ value: -2000, card: false, description: "Pagamento de fatura" }),
        txn({ value: -900, card: false, description: "Aplicação RDB" }),
        txn({ value: -500, card: false, category: "Same person transfer - PIX" }),
        txn({ value: 8000, card: false, description: "Transferência recebida" }),
        txn({ value: 2000, card: true, description: "Pagamento recebido" }),
        txn({ value: -60, day: "2026-10-01" }),
      ],
      "2026-11-01",
      "2026-11-30",
    );
    expect(summary).toMatchObject({ spent: 140, income: 8000, topMerchants: [{ name: "pao de acucar", total: 140, count: 2 }] });
  });
});

describe("committedMonths", () => {
  it("projects the remaining parcelas from each card's latest statement only", () => {
    expect(
      committedMonths([
        txn({ value: -100, billMonth: "2026-11", installment: { number: 2, total: 4 } }),
        txn({ value: -50, billMonth: "2026-11", installment: { number: 10, total: 10 } }),
        txn({ value: -100, billMonth: "2026-10", installment: { number: 1, total: 4 } }),
        txn({ value: -30, billMonth: "2026-11" }),
        txn({ account: "Itaú cartão 9876", value: -200, billMonth: "2026-12", installment: { number: 1, total: 2 } }),
      ]),
    ).toEqual([
      { month: "2026-12", total: 100 },
      { month: "2027-01", total: 300 },
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
