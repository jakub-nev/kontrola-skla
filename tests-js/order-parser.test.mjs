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
