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
