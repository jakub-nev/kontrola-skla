// Porovná JS a Python nad stejnou dvojicí souborů. Jediné, co odhalí rozdíl
// ve skládání řádků z PDF. V CI běžet nemůže -- faktura se necommituje.
//
//   npm run parita -- faktura.pdf objednavka.xlsx
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

import ExcelJS from "exceljs";
// legacy/build, ne build/pdf.mjs -- ten pod Node hází ERR_MODULE_NOT_FOUND.
// Prohlížeč nadále používá web/vendor/pdf.mjs, tohle se týká jen tohoto
// Node skriptu.
import * as pdfjsLib from "pdfjs-dist/legacy/build/pdf.mjs";

import { extractLines } from "../web/lib/pdf-lines.js";
import { parseInvoiceLines } from "../web/lib/invoice-parser.js";
import { parseOrder } from "../web/lib/order-parser.js";
import { matchItems } from "../web/lib/matcher.js";
import { resultRow } from "../web/lib/report.js";

const [pdf, xlsx] = process.argv.slice(2);
if (!pdf || !xlsx) {
  console.error("použití: npm run parita -- <faktura.pdf> <objednavka.xlsx>");
  process.exit(2);
}

const radkyJs = matchItems(
  await parseOrder(ExcelJS, xlsx),
  parseInvoiceLines(await extractLines(pdfjsLib, await readFile(pdf))),
).map(resultRow);

const PYTHON = [
  "import json, sys",
  "from invoice_parser import parse_invoice",
  "from order_parser import parse_order",
  "from matcher import match_items",
  "from report import result_row",
  "res = match_items(parse_order(sys.argv[2]), parse_invoice(sys.argv[1]))",
  "print(json.dumps([result_row(r) for r in res], ensure_ascii=False))",
].join("\n");

const radkyPy = JSON.parse(
  execFileSync("py", ["-3.10", "-c", PYTHON, pdf, xlsx], {
    encoding: "utf-8",
    env: { ...process.env, PYTHONIOENCODING: "utf-8" },
  }),
);

let rozdilu = 0;
const delka = Math.max(radkyJs.length, radkyPy.length);
for (let i = 0; i < delka; i += 1) {
  const js = radkyJs[i];
  const py = radkyPy[i];
  if (JSON.stringify(js) === JSON.stringify(py)) continue;
  rozdilu += 1;
  console.log(`--- řádek ${i + 1}`);
  console.log("  JS    :", JSON.stringify(js));
  console.log("  Python:", JSON.stringify(py));
}

console.log(rozdilu
  ? `\n${rozdilu} rozdílů z ${delka} řádků.`
  : `Shoda: ${delka} řádků.`);
process.exit(rozdilu ? 1 : 0);
