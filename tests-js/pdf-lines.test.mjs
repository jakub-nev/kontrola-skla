import test from "node:test";
import assert from "node:assert/strict";

import { linesFromItems } from "../web/lib/pdf-lines.js";

const kus = (str, x, y, { size = 10, width = str.length * 5 } = {}) =>
  ({ str, width, transform: [size, 0, 0, size, x, y] });

test("items on the same baseline become one line, left to right", () => {
  assert.deepEqual(
    linesFromItems([kus("x975", 120, 700), kus("001", 50, 700)]),
    ["001 x975"],
  );
});

test("higher y comes first", () => {
  assert.deepEqual(
    linesFromItems([kus("dole", 50, 600), kus("nahore", 50, 700)]),
    ["nahore", "dole"],
  );
});

test("a small baseline wobble stays on one line", () => {
  assert.deepEqual(
    linesFromItems([kus("a", 50, 700), kus("b", 70, 701.4)]),
    ["a b"],
  );
});

test("touching items are joined without a space", () => {
  // "1346" konci na x=140, "x975" zacina na 141 -> pdfplumber tady mezeru nedá
  assert.deepEqual(
    linesFromItems([kus("1346", 120, 700, { width: 20 }), kus("x975", 141, 700)]),
    ["1346x975"],
  );
});

test("empty items are dropped and lines trimmed", () => {
  assert.deepEqual(linesFromItems([kus("", 10, 700), kus("a", 50, 700)]), ["a"]);
});

test("blank lines never reach the caller", () => {
  assert.deepEqual(linesFromItems([kus("   ", 10, 700)]), []);
});
