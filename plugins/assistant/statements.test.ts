import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadStatements, parseNubankCsv, parseOfx } from "./statements.js";

const ITAU_CHECKING = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
ENCODING:USASCII
CHARSET:1252

<OFX>
<BANKMSGSRSV1><STMTTRNRS><STMTRS>
<CURDEF>BRL
<BANKACCTFROM><BANKID>0341<BRANCHID>1234<ACCTID>567890<ACCTTYPE>CHECKING</BANKACCTFROM>
<BANKTRANLIST>
<DTSTART>20261101<DTEND>20261118
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20261110100000[-03:EST]<TRNAMT>-182.40<FITID>A1<MEMO>PAG BOLETO LIGHT</STMTTRN>
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20261105<TRNAMT>8500,00<FITID>A2<MEMO>SALÁRIO</STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>4321.09<DTASOF>20261118</LEDGERBAL>
</STMTRS></STMTTRNRS></BANKMSGSRSV1>
</OFX>`;

const NUBANK_CARD_OFX = `<?xml version="1.0" encoding="utf-8"?>
<OFX><CREDITCARDMSGSRSV1><CCSTMTTRNRS><CCSTMTRS>
<CCACCTFROM><ACCTID>abc-1234</ACCTID></CCACCTFROM>
<BANKTRANLIST><DTSTART>20261010</DTSTART><DTEND>20261110</DTEND>
<STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261020000000[-3:BRT]</DTPOSTED><TRNAMT>-250.00</TRNAMT><FITID>n1</FITID><MEMO>Fast Shop - Parcela 2/6</MEMO></STMTTRN>
</BANKTRANLIST>
<LEDGERBAL><BALAMT>-1500.00</BALAMT><DTASOF>20261110</DTASOF></LEDGERBAL>
</CCSTMTRS></CCSTMTTRNRS></CREDITCARDMSGSRSV1></OFX>`;

describe("parseOfx", () => {
  it("reads a Windows-1252 Itaú checking export with its balance", () => {
    const { account, txns } = parseOfx(new Uint8Array(Buffer.from(ITAU_CHECKING, "latin1")));
    expect(account).toEqual({ label: "Itaú conta 7890", card: false, balance: 4321.09, balanceDay: "2026-11-18" });
    expect(txns.map((txn) => [txn.day, txn.value, txn.description])).toEqual([
      ["2026-11-10", -182.4, "PAG BOLETO LIGHT"],
      ["2026-11-05", 8500, "SALÁRIO"],
    ]);
  });

  it("reads a card export with closing tags, its bill month and parcelas, without a balance", () => {
    const { account, txns } = parseOfx(new Uint8Array(Buffer.from(NUBANK_CARD_OFX)));
    expect(account).toMatchObject({ label: "Banco cartão 1234", card: true, balance: null });
    expect(txns[0]).toMatchObject({ day: "2026-10-20", value: -250, billMonth: "2026-11", installment: { number: 2, total: 6 } });
  });
});

describe("parseNubankCsv", () => {
  it("reads a card fatura, turning positive amounts into money out", () => {
    const statement = parseNubankCsv('date,title,amount\n2026-10-12,"Mercado, Livre - Parcela 1/3",99.90\n2026-10-15,Pagamento recebido,-1200\n', "Nubank_2026-11-10.csv");
    expect(statement?.txns.map((txn) => [txn.description, txn.value, txn.billMonth, txn.installment])).toEqual([
      ["Mercado, Livre - Parcela 1/3", -99.9, "2026-11", { number: 1, total: 3 }],
      ["Pagamento recebido", 1200, "2026-11", null],
    ]);
  });

  it("reads an account statement keyed by its identifier and rejects other CSVs", () => {
    const statement = parseNubankCsv("Data,Valor,Identificador,Descrição\n05/11/2026,-45.00,id-1,Transferência enviada pelo Pix - Ana\n", "NU_123.csv");
    expect(statement?.txns[0]).toMatchObject({ key: "Nubank conta|id-1", day: "2026-11-05", value: -45, card: false });
    expect(parseNubankCsv("foo,bar\n1,2\n", "other.csv")).toBeNull();
  });
});

describe("loadStatements", () => {
  let folder: string;
  afterEach(() => rm(folder, { recursive: true, force: true }));

  it("merges overlapping exports, keeps the newest balance and skips unknown files", async () => {
    folder = await mkdtemp(join(tmpdir(), "statements-"));
    const older = ITAU_CHECKING.replace("<BALAMT>4321.09<DTASOF>20261118", "<BALAMT>100.00<DTASOF>20261101");
    await writeFile(join(folder, "a-itau.ofx"), Buffer.from(ITAU_CHECKING, "latin1"));
    await writeFile(join(folder, "b-itau-old.ofx"), Buffer.from(older, "latin1"));
    await writeFile(join(folder, "notes.csv"), "x,y\n");
    await writeFile(join(folder, "readme.txt"), "ignore me");
    const warnings: string[] = [];
    const { accounts, txns } = await loadStatements(folder, (message) => warnings.push(message));
    expect(accounts).toEqual([{ label: "Itaú conta 7890", card: false, balance: 4321.09, balanceDay: "2026-11-18" }]);
    expect(txns).toHaveLength(2);
    expect(warnings).toEqual(["skipped notes.csv: not a Nubank CSV export"]);
  });

  it("treats a missing folder as no statements yet", async () => {
    folder = await mkdtemp(join(tmpdir(), "statements-"));
    expect(await loadStatements(join(folder, "missing"), () => {})).toEqual({ accounts: [], txns: [] });
  });
});
