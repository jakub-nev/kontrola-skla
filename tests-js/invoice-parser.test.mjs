import test from "node:test";
import assert from "node:assert/strict";

import { parseComposition, parseInvoiceLines } from "../web/lib/invoice-parser.js";

test("composition triple slash notation", () => {
  assert.deepEqual(parseComposition("SGG Climatop XN PXN 4mm / PLC 4mm / PXN 4mm"),
                   [4, 4, 4]);
});

test("composition double with spaced mm", () => {
  assert.deepEqual(parseComposition("SGG Climaplus XN Planitherm XN 4mm Satinato 4 mm"),
                   [4, 4]);
});

test("composition laminated stadip", () => {
  const text = "SGG Climatop XN Stadip Antelio ® silver 6 mm Planitherm XN 4mm Stadip 33.2 XN";
  assert.deepEqual(parseComposition(text), [6, 4, 33.2]);
});

test("composition ignores non-thickness numbers", () => {
  const text = "Planitherm XN 4mm OR 572 CL4 kura čirá Planitherm XN 4mm";
  assert.deepEqual(parseComposition(text), [4, 4]);
});

test("item line with label, dims and spacer", () => {
  const [it] = parseInvoiceLines([
    "SGG Climaplus XN Planitherm XN 4mm Satinato 4 mm",
    "001 kanceláře 6 1346 x975 16mm SWS Černý 21 1412.40 8474.40",
  ]);
  assert.equal(it.position, "001");
  assert.equal(it.label, "kanceláře");
  assert.equal(it.quantity, 6);
  assert.equal(it.width, 1346);
  assert.equal(it.height, 975);
  assert.equal(it.spacer, 16);
  assert.deepEqual(it.panes, [4, 4]);
});

test("numeric label and quantity are not confused", () => {
  const [it] = parseInvoiceLines([
    "SGG Climatop XN PXN 4mm / PLC 4mm / PXN 4mm",
    "018 5 6 634 x 1245 18mm SWS 21 900.00 5400.00",
  ]);
  assert.equal(it.label, "5");
  assert.equal(it.quantity, 6);
  assert.equal(it.width, 634);
  assert.equal(it.height, 1245);
});

test("item without a label parses", () => {
  const [it] = parseInvoiceLines([
    "SGG Climatop XN PXN 4mm / PLC 4mm / PXN 4mm",
    "007 1 915 x 1965 20mm SWS 21 100.00 100.00",
  ]);
  assert.equal(it.label, "");
  assert.equal(it.quantity, 1);
  assert.equal(it.width, 915);
});

test("composition carries over to a later item without its own block", () => {
  const items = parseInvoiceLines([
    "SGG Climatop XN PXN 4mm / PLC 4mm / PXN 4mm",
    "006 1 800 x 500 16mm SWS 21 100.00 100.00",
    "014 1 820 x 505 16mm SWS 21 100.00 100.00",
  ]);
  assert.equal(items.length, 2);
  assert.deepEqual(items[1].panes, [4, 4, 4]);
  assert.equal(items[1].width, 820);
});

test("non-item lines are skipped", () => {
  const items = parseInvoiceLines([
    "SGG Climatop XN PXN 4mm / PLC 4mm / PXN 4mm",
    "001 1 800 x 500 16mm SWS 21 100.00 100.00",
    "990 doprava 1 000.00",
    "Celkem k úhradě 12 345.00",
  ]);
  assert.equal(items.length, 1);
});

test("multi-line composition block is joined", () => {
  const [it] = parseInvoiceLines([
    "SGG Climatop XN Stadip Antelio ® silver 6 mm",
    "Planitherm XN 4mm Stadip 33.2 XN",
    "002 vchod 1 796 x 2222 18mm SWS 21 100.00 100.00",
  ]);
  assert.deepEqual(it.panes, [6, 4, 33.2]);
});

// --- Sklenářství NONSTOP ---------------------------------------------------
// Druhý dodavatel, úplně jiné rozvržení. Pasti jsou skutečné: v "4 iplus 1.1
// 18 TPS 4 FL" je 1.1 označení výrobku a 0,5 na konci součinitel prostupu --
// ani jedno není sklo.

import { parseNonstopComposition, parseNonstopLines } from "../web/lib/invoice-parser.js";

const POLOZKA = [
  "Zakázka zákazníka: Cenová nabídka",
  "1,1.1",
  "Pozice zákazníka: Morbicer",
  "1 4 iplus 1.1 18 TPS 4 FL 18 TPS 4 iplus 1.1 Ar U 0,5",
  "Cena zákl. složení IZO 1,059.0 m2 1.16 1,228.44 0.00 % 7,374.0",
  "Srážení hran Hrana 1/2/3/4 m=4.30 0.00 m 4.30 0.00 0.00 % 0.00",
  "Celkem: 6 Ks. 1019 x 1125 211.46 1,229.00 7,374.00",
];

test("nonstop: quantity and dimensions", () => {
  const [it] = parseNonstopLines(POLOZKA);
  assert.equal(it.quantity, 6);
  assert.equal(it.width, 1019);
  assert.equal(it.height, 1125);
});

test("nonstop: triple glazing panes and spacer", () => {
  const [it] = parseNonstopLines(POLOZKA);
  assert.deepEqual(it.panes, [4, 4, 4]);
  assert.equal(it.spacer, 18);
});

test("nonstop: product code and U-value are not glass", () => {
  const [it] = parseNonstopLines(POLOZKA);
  assert.ok(!it.panes.includes(1.1));
  assert.ok(!it.panes.includes(0.5));
});

test("nonstop: double glazing", () => {
  const [it] = parseNonstopLines([
    "Pozice zákazníka: Nemec",
    "12 6 FL 16 TPS 4 iplus 1.1 Ar U 1,1",
    "Celkem: 8 Ks. 707 x 975 140.53 667.00 5,336.00",
  ]);
  assert.deepEqual(it.panes, [6, 4]);
  assert.equal(it.spacer, 16);
  assert.equal(it.quantity, 8);
});

test("nonstop: pane order is kept as printed", () => {
  const [it] = parseNonstopLines([
    "Pozice zákazníka: Nemec",
    "16 4 Crepi 16 TPS 6 iplus 1.1 Ar U 1,1",
    "Celkem: 2 Ks. 605 x 545 16.94 514.00 1,028.00",
  ]);
  assert.deepEqual(it.panes, [4, 6]);
});

test("nonstop: product name with dots survives", () => {
  const [it] = parseNonstopLines([
    "Pozice zákazníka: Nemec",
    "15 6 ST.CL.CLEA 16 TPS 4 iplus 1.1 Ar U 1,1",
    "Celkem: 1 Ks. 805 x 1780 36.34 1,381.00 1,381.00",
  ]);
  assert.deepEqual(it.panes, [6, 4]);
});

test("nonstop: label comes from the line above Pozice", () => {
  assert.equal(parseNonstopLines(POLOZKA)[0].label, "1,1.1");
});

test("nonstop: provider is recorded", () => {
  assert.equal(parseNonstopLines(POLOZKA)[0].provider, "Sklenářství NONSTOP");
});

test("nonstop: address line is not mistaken for a composition", () => {
  const items = parseNonstopLines([
    "SKLENÁŘSTVÍ NONSTOP plus s.r.o. Nabídka č. 2000081",
    "150 00 Praha 5-Smíchov",
    "Pozice zákazníka: Morbicer",
    "2 4 iplus 1.1 18 TPS 4 FL 18 TPS 4 iplus 1.1 Ar U 0,5",
    "Celkem: 1 Ks. 722 x 1216 27.11 954.00 954.00",
  ]);
  assert.equal(items.length, 1);
  assert.deepEqual(items[0].panes, [4, 4, 4]);
});

test("nonstop: unknown spacer type yields no make-up rather than a guess", () => {
  assert.deepEqual(parseNonstopComposition("4 iplus 16 SWS 4 FL"), [[], []]);
});

test("dispatcher picks the layout that finds items", () => {
  assert.equal(parseInvoiceLines(POLOZKA).length, 1);
  assert.equal(parseInvoiceLines(POLOZKA)[0].provider, "Sklenářství NONSTOP");
  const stary = parseInvoiceLines([
    "SGG Climatop XN PXN 4mm / PLC 4mm / PXN 4mm",
    "001 kanceláře 6 1346 x975 16mm SWS Černý 21 1412.40 8474.40",
  ]);
  assert.equal(stary.length, 1);
  assert.equal(stary[0].provider, "Glassolutions");
});
