import test from "node:test";
import assert from "node:assert/strict";

import { matchItems } from "../web/lib/matcher.js";

function order(w, h, { qty = 1, panes, gaps, skladba = "4-18-4-18-4" } = {}) {
  if (panes === undefined && skladba === "4-18-4-18-4") {
    panes = [4, 4, 4];
    gaps = [18, 18];
  }
  return { number: "1", objekt: "obj", label: "1", width: w, height: h,
           quantity: qty, skladbaRaw: skladba, typ: "trojsklo",
           panes: panes ?? null, gaps: gaps ?? null };
}

function invoice(w, h, { qty = 1, panes, spacer = 18,
                         comp = "PXN 4mm / PLC 4mm / PXN 4mm" } = {}) {
  return { position: "001", label: "1", quantity: qty, width: w, height: h,
           spacer, compositionRaw: comp, panes: panes ?? [4, 4, 4] };
}

test("exact match ok", () => {
  const [r] = matchItems([order(830, 1400)], [invoice(830, 1400)]);
  assert.equal(r.status, "OK");
  assert.deepEqual(r.problems, []);
});

test("swapped orientation is warning", () => {
  const [r] = matchItems([order(830, 1400)], [invoice(1400, 830)]);
  assert.equal(r.status, "WARNING");
  assert.ok(r.problems.some((p) => p.includes("prohozen")));
});

test("swap does not steal exact match", () => {
  const res = matchItems([order(830, 1400), order(1400, 830)], [invoice(1400, 830)]);
  const byDims = new Map(res.filter((r) => r.orderItem)
    .map((r) => [`${r.orderItem.width}x${r.orderItem.height}`, r.status]));
  assert.equal(byDims.get("1400x830"), "OK");
  assert.equal(byDims.get("830x1400"), "MISSING");
});

test("quantity mismatch", () => {
  const [r] = matchItems([order(830, 1400, { qty: 2 })],
                         [invoice(830, 1400, { qty: 1 })]);
  assert.equal(r.status, "WARNING");
  assert.ok(r.problems.some((p) => p.includes("objednáno 2") && p.includes("fakturováno 1")));
});

test("quantity aggregated across lines", () => {
  const res = matchItems([order(800, 600, { qty: 2 }), order(800, 600, { qty: 2 })],
                         [invoice(800, 600, { qty: 4 })]);
  assert.deepEqual(res.map((r) => r.status), ["OK", "OK"]);
});

test("pane thickness mismatch", () => {
  const [r] = matchItems([order(830, 1400)],
                         [invoice(830, 1400, { panes: [6, 4, 4] })]);
  assert.equal(r.status, "WARNING");
  assert.ok(r.problems.some((p) => p.includes("tloušťky")));
});

test("pane count mismatch", () => {
  const [r] = matchItems([order(830, 1400)],
                         [invoice(830, 1400, { panes: [4, 4], comp: "dvojsklo" })]);
  assert.equal(r.status, "WARNING");
  assert.ok(r.problems.some((p) => p.includes("počet skel")));
});

test("spacer mismatch", () => {
  const [r] = matchItems([order(830, 1400)], [invoice(830, 1400, { spacer: 16 })]);
  assert.equal(r.status, "WARNING");
  assert.ok(r.problems.some((p) => p.includes("rámeček")));
});

test("laminated panes compare equal regardless of order", () => {
  const o = order(654, 1140, { panes: [33.2, 4, 6], gaps: [16, 16],
                               skladba: "33.2 XN-16-4-16-6 XN" });
  const i = invoice(654, 1140, { panes: [6, 4, 33.2], spacer: 16 });
  const [r] = matchItems([o], [i]);
  assert.equal(r.status, "OK");
});

test("unparseable skladba degrades to no type check", () => {
  const o = order(830, 1400, { panes: null, gaps: null, skladba: "speciální sklo" });
  const [r] = matchItems([o], [invoice(830, 1400, { panes: [6, 6] })]);
  assert.equal(r.status, "OK");
});

test("missing on invoice", () => {
  const [r] = matchItems([order(830, 1400)], []);
  assert.equal(r.status, "MISSING");
  assert.equal(r.invoiceItem, null);
});

test("extra on invoice", () => {
  const [r] = matchItems([], [invoice(830, 1400)]);
  assert.equal(r.status, "EXTRA");
  assert.equal(r.orderItem, null);
});

test("same dims different types pair correctly", () => {
  const o1 = order(654, 1140, { qty: 6, panes: [33.2, 4, 6], gaps: [16, 16],
                                skladba: "33.2 XN-16-4-16-6 XN" });
  const o2 = order(654, 1140, { qty: 2 });
  const i1 = invoice(654, 1140, { qty: 2, spacer: 18 });
  const i2 = invoice(654, 1140, { qty: 6, panes: [33.2, 4, 6], spacer: 16 });
  assert.deepEqual(matchItems([o1, o2], [i1, i2]).map((r) => r.status), ["OK", "OK"]);
});
