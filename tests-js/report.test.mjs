import test from "node:test";
import assert from "node:assert/strict";
import ExcelJS from "exceljs";

import { HEADERS, reportBuffer, resultRow, sheetTitle } from "../web/lib/report.js";

const o = { number: "1", objekt: "becica", label: "1", width: 830, height: 1400,
            quantity: 1, skladbaRaw: "4-18-4-18-4", typ: "trojsklo",
            panes: [4, 4, 4], gaps: [18, 18] };
const i = { position: "001", label: "1", quantity: 1, width: 830, height: 1400,
            spacer: 18, compositionRaw: "PXN 4mm / PLC 4mm / PXN 4mm",
            panes: [4, 4, 4] };

const VYSLEDKY = [
  { status: "OK", orderItem: o, invoiceItem: i, problems: [] },
  { status: "MISSING", orderItem: o, invoiceItem: null,
    problems: ["rozměr 830 x 1400 na faktuře chybí"] },
  { status: "EXTRA", orderItem: null, invoiceItem: i,
    problems: ["rozměr 830 x 1400 nebyl objednán"] },
];

test("result row has ten columns and Czech status text", () => {
  const row = resultRow(VYSLEDKY[1]);
  assert.equal(row.length, HEADERS.length);
  assert.equal(row[0], "chybí na faktuře");
  assert.equal(row[3], "830 x 1400");
  assert.equal(row[4], "");
});

test("workbook round trip", async () => {
  const buf = await reportBuffer(ExcelJS, VYSLEDKY);
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.load(buf);
  const ws = wb.worksheets[0];

  assert.equal(ws.rowCount, 4);                       // hlavička + 3 výsledky
  assert.equal(ws.getRow(1).getCell(1).value, "Stav");
  assert.equal(ws.getRow(2).getCell(1).value, "OK");
  assert.equal(ws.getRow(3).getCell(1).value, "chybí na faktuře");
  assert.equal(ws.getRow(4).getCell(1).value, "navíc na faktuře");
  assert.ok(String(ws.getRow(2).getCell(4).value).includes("830 x 1400"));
  assert.ok(String(ws.getRow(4).getCell(5).value).includes("830 x 1400"));
  assert.equal(ws.getRow(2).getCell(1).fill.fgColor.argb, "FFC6EFCE");
});

test("sheet title names the provider", () => {
  const iN = { ...i, provider: "Sklenářství NONSTOP" };
  const title = sheetTitle([{ status: "OK", orderItem: o, invoiceItem: iN, problems: [] }]);
  assert.equal(title, "Kontrola — Sklenářství NONSTOP");
  assert.ok(title.length <= 31);                 // strop Excelu
  // bez faktury (jen chybějící položky) zůstane holý název
  assert.equal(sheetTitle([{ status: "MISSING", orderItem: o, invoiceItem: null, problems: [] }]),
               "Kontrola");
});
