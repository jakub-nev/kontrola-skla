// Port order_parser.py. Zatím jen parseSkladba, čtení xlsx přijde později.

const CISLO_RE = /^(\d+(?:[.,]\d+)?)/;

/** "4-18-4-18-4" -> [[4,4,4],[18,18]]; nerozluštitelné -> [null, null]. */
export function parseSkladba(s) {
  const tokeny = String(s ?? "").split("-").map((t) => t.trim());
  const hodnoty = [];
  for (const t of tokeny) {
    const m = CISLO_RE.exec(t);
    if (!m) return [null, null];
    hodnoty.push(Number(m[1].replace(",", ".")));
  }
  // sklo-mezera-sklo... je vždy lichý počet
  if (hodnoty.length % 2 === 0) return [null, null];
  return [hodnoty.filter((_, i) => i % 2 === 0), hodnoty.filter((_, i) => i % 2 === 1)];
}

// Normalizovaná předpona hlavičky -> vlastnost položky
const SLOUPCE = new Map([
  ["polozka", "number"],
  ["objekt", "objekt"],
  ["oznaceni", "label"],
  ["sirka", "width"],
  ["vyska", "height"],
  ["kus", "quantity"],
  ["skladba", "skladbaRaw"],
  ["typ skla", "typ"],
]);
const POVINNE = ["width", "height", "quantity"];

/** Malá písmena bez diakritiky: "Šířka (mm)" -> "sirka (mm)". */
function norm(s) {
  return String(s ?? "").normalize("NFKD").replace(/\p{M}/gu, "").toLowerCase().trim();
}

/** Prázdná buňka -> výchozí hodnota, jinak oříznutí k nule jako int(float(x)). */
function naCislo(hodnota, vychozi = 1) {
  if (hodnota === null || hodnota === undefined || String(hodnota).trim() === "") {
    return vychozi;
  }
  return Math.trunc(Number(String(hodnota).replace(",", ".")));
}

/** Sloupec sedí, jen když je to celé slovo -- "Kusovník" není "Kus". */
function sloupecSedi(jmeno, predpona) {
  return jmeno === predpona
    || jmeno.startsWith(predpona + " ")
    || jmeno.startsWith(predpona + "(");
}

/** Řádky sešitu (první je hlavička) -> položky objednávky. */
export function parseOrderRows(rows) {
  const [hlavicka = [], ...zbytek] = rows;

  const index = new Map();
  hlavicka.forEach((bunka, i) => {
    const jmeno = norm(bunka);
    for (const [predpona, vlastnost] of SLOUPCE) {
      if (sloupecSedi(jmeno, predpona) && !index.has(vlastnost)) index.set(vlastnost, i);
    }
  });
  for (const vlastnost of POVINNE) {
    if (!index.has(vlastnost)) {
      throw new Error(`V objednávce chybí sloupec: ${vlastnost} (šířka/výška/kus)`);
    }
  }

  const dej = (row, vlastnost) => {
    const i = index.get(vlastnost);
    return i === undefined ? null : row[i] ?? null;
  };

  const polozky = [];
  for (const row of zbytek) {
    const w = dej(row, "width");
    const h = dej(row, "height");
    if (w === null || h === null) continue;          // koncové prázdné řádky
    const skladbaRaw = String(dej(row, "skladbaRaw") || "").trim();
    const [panes, gaps] = parseSkladba(skladbaRaw);
    polozky.push({
      number: String(dej(row, "number") || ""),
      objekt: String(dej(row, "objekt") || "").trim(),
      label: String(dej(row, "label") || "").trim(),
      width: naCislo(w),
      height: naCislo(h),
      quantity: naCislo(dej(row, "quantity"), 1),
      skladbaRaw,
      typ: String(dej(row, "typ") || "").trim(),
      panes,
      gaps,
    });
  }
  return polozky;
}

/** ExcelJS se předává zvenčí: prohlížeč dá globál, Node dá node_modules. */
export async function parseOrder(ExcelJS, source) {
  const wb = new ExcelJS.Workbook();
  if (typeof source === "string") {
    await wb.xlsx.readFile(source);
  } else {
    const buf = source instanceof ArrayBuffer ? source : await source.arrayBuffer();
    await wb.xlsx.load(buf);
  }
  const ws = wb.worksheets[0];
  const rows = [];
  ws.eachRow({ includeEmpty: false }, (row) => {
    // values je 1-based a nultý prvek je prázdný
    rows.push(row.values.slice(1).map((v) => (v && v.result !== undefined ? v.result : v)));
  });
  return parseOrderRows(rows);
}
