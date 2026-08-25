import test from "node:test";
import assert from "node:assert/strict";

import { parseSkladba } from "../web/lib/order-parser.js";

test("skladba triple", () => {
  assert.deepEqual(parseSkladba("4-18-4-18-4"), [[4, 4, 4], [18, 18]]);
});

test("skladba double", () => {
  assert.deepEqual(parseSkladba("4-16-4"), [[4, 4], [16]]);
});

test("skladba laminated with suffixes", () => {
  const [panes, gaps] = parseSkladba("33.2 XN-16-4-16-6 XN");
  assert.deepEqual(panes, [33.2, 4, 6]);
  assert.deepEqual(gaps, [16, 16]);
});

test("skladba unparseable returns null", () => {
  assert.deepEqual(parseSkladba("trojsklo standard"), [null, null]);
  assert.deepEqual(parseSkladba(""), [null, null]);
  assert.deepEqual(parseSkladba("4-18"), [null, null]);   // sudý počet = nejednoznačné
});

import { join } from "node:path";
import ExcelJS from "exceljs";
import { parseOrder, parseOrderRows } from "../web/lib/order-parser.js";

const VZOR = join(import.meta.dirname, "..",
                  "objednavka_sklo_VltavaHolding_16.9.25.xlsx");

test("row count ignores trailing empty rows", async () => {
  const items = await parseOrder(ExcelJS, VZOR);
  assert.equal(items.length, 11);
});

test("first row", async () => {
  const [it] = await parseOrder(ExcelJS, VZOR);
  assert.equal(it.objekt, "becica");
  assert.equal(it.width, 830);
  assert.equal(it.height, 1400);
  assert.equal(it.quantity, 1);
  assert.equal(it.skladbaRaw, "4-18-4-18-4");
  assert.deepEqual(it.panes, [4, 4, 4]);
  assert.deepEqual(it.gaps, [18, 18]);
});

test("laminated row", async () => {
  const items = await parseOrder(ExcelJS, VZOR);
  const it = items[7];
  assert.equal(it.width, 654);
  assert.equal(it.height, 1140);
  assert.equal(it.quantity, 6);
  assert.deepEqual(it.panes, [33.2, 4, 6]);
  assert.deepEqual(it.gaps, [16, 16]);
  assert.ok(it.typ.toLowerCase().includes("protihlukov"));
});

test("missing column raises", () => {
  assert.throws(() => parseOrderRows([["Položka", "Objekt"]]), /chybí sloupec/);
});

test("zero quantity preserved", () => {
  const rows = [
    ["Položka", "Objekt", "Označení pozice", "Šířka (mm)", "Výška (mm)", "Kus",
     "Skladba skla", "Typ skla"],
    [1, "x", 1, 800, 600, 0, "4-16-4", "dvojsklo"],
  ];
  assert.equal(parseOrderRows(rows)[0].quantity, 0);
});

test("kusovnik column not mistaken for kus", () => {
  const rows = [
    ["Kusovník", "Šířka (mm)", "Výška (mm)", "Kus"],
    ["A-1", 800, 600, 3],
  ];
  assert.equal(parseOrderRows(rows)[0].quantity, 3);
});
