// Port invoice_parser.py. Rozdělené na řádkovou část (čistá, testovatelná
// bez PDF) a obal, který si řádky vezme z pdf-lines.js.

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
export function parseInvoiceLines(lines) {
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
