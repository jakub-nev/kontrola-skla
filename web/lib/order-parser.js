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
