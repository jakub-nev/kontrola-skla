// Port invoice_parser.py. Dva dodavatelé, dvě nesouvisející rozvržení.
// Každé je čistá funkce nad řádky, takže jde testovat bez PDF -- skutečné
// dokumenty jsou zákaznická data a do repa nepatří.

export const GLASSOLUTIONS = "Glassolutions";
export const NONSTOP = "Sklenářství NONSTOP";

// pdfplumber i pdf.js umí vrátit "1346 x975" bez mezery před výškou,
// proto \s* na obou stranách "x".
const POLOZKA_RE =
  /^(?<pos>\d{3})\s+(?:(?<label>\S+)\s+)?(?<qty>\d+)\s+(?<w>\d+)\s*x\s*(?<h>\d+)\s+(?<spacer>\d+)\s*mm\b/i;

// "4mm" / "4 mm" -> tloušťka; holé desetinné "33.2" -> vrstvené sklo.
// Holá celá čísla bez "mm" (třeba "OR 572" nebo DPH "21") se chytit nesmí.
const SKLO_RE = /(?<mm>\d+(?:[.,]\d+)?)\s*mm|(?<lam>\d+[.,]\d+)/g;

// Do bloku se skladbou patří jen řádky, které zmiňují tloušťku.
const TLOUSTKA_RE = /\d+\s*mm|\d+[.,]\d+/;

/** Tloušťky skel z popisu skladby, v pořadí výskytu. */
export function parseComposition(text) {
  const skla = [];
  for (const m of String(text).matchAll(SKLO_RE)) {
    const hodnota = m.groups.mm ?? m.groups.lam;
    skla.push(Number(hodnota.replace(",", ".")));
  }
  return skla;
}

/** Řádky faktury -> položky. Skladba platí od svého bloku dál. */
export function parseGlassolutionsLines(lines) {
  const polozky = [];
  let blok = [];
  let vBloku = false;

  for (const raw of lines) {
    const line = raw.trim();
    const m = POLOZKA_RE.exec(line);
    if (m) {
      vBloku = false;
      const skladba = blok.join(" ");
      polozky.push({
        position: m.groups.pos,
        label: m.groups.label ?? "",
        quantity: Number(m.groups.qty),
        width: Number(m.groups.w),
        height: Number(m.groups.h),
        spacer: Number(m.groups.spacer),
        compositionRaw: skladba,
        panes: parseComposition(skladba),
        provider: GLASSOLUTIONS,
      });
    } else if (line.startsWith("SGG")) {
      blok = [line];
      vBloku = true;
    } else if (vBloku && TLOUSTKA_RE.test(line)) {
      blok.push(line);
    } else if (vBloku) {
      vBloku = false;    // blok skončil dřív než položka; skladbu si necháme
    }
  }
  return polozky;
}

// --- Sklenářství NONSTOP ---------------------------------------------------
// Celkem: 6 Ks. 1019 x 1125 211.46 1,229.00 7,374.00
const NONSTOP_POLOZKA_RE = /^Celkem:\s*(\d+)\s*Ks\.\s*(\d+)\s*x\s*(\d+)\b/;

// "Pozice zákazníka: Morbicer" -- pozice zákazníka je vytištěná o řádek výš.
const NONSTOP_POZICE_RE = /^Pozice zákazníka:/;

// Řádek skladby je číslo položky a za ním složení, např.
// "1 4 iplus 1.1 18 TPS 4 FL 18 TPS 4 iplus 1.1 Ar U 0,5".
const NONSTOP_SKLADBA_RE = /^\d+\s+(\d+(?:[.,]\d+)?\s+\S.*)$/;

// Značka rámečku. Kotvení na ni je jediné, co dělá skladbu čitelnou: "iplus 1.1"
// je označení výrobku a "U 0,5" součinitel prostupu tepla, takže ani jedno nesmí
// projít jako sklo. Čísla označená TPS jsou mezery, první číslo každého úseku
// mezi nimi je sklo. Neznámý typ rámečku nevrátí nic a matcher pak kontrolu
// skladby přeskočí, místo aby si vymyslel neshodu.
const NONSTOP_RAMECEK_RE = /(\d+(?:[.,]\d+)?)\s+TPS\b/g;
const UVODNI_CISLO_RE = /^\s*(\d+(?:[.,]\d+)?)/;

const cislo = (s) => Number(s.replace(",", "."));

/** "4 iplus 1.1 18 TPS 4 FL" -> [[4, 4], [18]]. Bez značky TPS -> [[], []]. */
export function parseNonstopComposition(text) {
  const gaps = [...text.matchAll(NONSTOP_RAMECEK_RE)].map((m) => cislo(m[1]));
  if (!gaps.length) return [[], []];
  const panes = [];
  for (const usek of text.split(NONSTOP_RAMECEK_RE).filter((_, i) => i % 2 === 0)) {
    const m = UVODNI_CISLO_RE.exec(usek);
    if (m) panes.push(cislo(m[1]));
  }
  return [panes, gaps];
}

/** Položka se táhne přes několik řádků a končí souhrnem "Celkem:". */
export function parseNonstopLines(lines) {
  const polozky = [];
  let label = "";
  let skladba = "";
  let predchozi = "";

  for (const raw of lines) {
    const line = raw.trim();
    if (NONSTOP_POZICE_RE.test(line)) {
      label = predchozi;
      skladba = "";            // začíná nová položka, skladbu po ní nedědíme
    } else {
      const ms = NONSTOP_SKLADBA_RE.exec(line);
      if (ms && line.includes("TPS")) {
        skladba = ms[1];
      } else {
        const m = NONSTOP_POLOZKA_RE.exec(line);
        if (m) {
          const [panes, gaps] = parseNonstopComposition(skladba);
          polozky.push({
            position: String(polozky.length + 1),
            label,
            quantity: Number(m[1]),
            width: Number(m[2]),
            height: Number(m[3]),
            spacer: gaps.length ? Math.trunc(gaps[0]) : null,
            compositionRaw: skladba,
            panes,
            provider: NONSTOP,
          });
        }
      }
    }
    predchozi = line;
  }
  return polozky;
}

// --- rozcestník -------------------------------------------------------------
const ROZVRZENI = [parseGlassolutionsLines, parseNonstopLines];

/** Zkusí známá rozvržení a vezme to, které našlo položky. */
export function parseInvoiceLines(lines) {
  for (const rozvrzeni of ROZVRZENI) {
    const polozky = rozvrzeni(lines);
    if (polozky.length) return polozky;
  }
  return [];
}
