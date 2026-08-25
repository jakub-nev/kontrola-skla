// pdfplumber vrací hotové řádky, pdf.js jen kusy textu se souřadnicemi.
// Tohle je jediné místo portu bez protějšku v Pythonu -- a jediné, kde se
// výsledek může tiše rozejít. Obě konstanty jsou ladicí šrouby: skutečné
// faktury sázejí text různě a heuristika se podle nich doostřuje.
// Ověřuje se scripts/parita.mjs proti skutečné faktuře.
const TOLERANCE = 2;        // svislý rozptyl jedné účtované řádky, v bodech
const MEZERA_POMER = 0.2;   // mezera > podíl velikosti písma => mezera ve slově

/** Kusy textu z pdf.js -> řádky shora dolů. */
export function linesFromItems(items, { tolerance = TOLERANCE,
                                        mezeraPomer = MEZERA_POMER } = {}) {
  const radky = [];
  for (const it of items) {
    if (!it.str) continue;
    const x = it.transform[4];
    const y = it.transform[5];
    const size = Math.abs(it.transform[3]) || 10;
    let radek = radky.find((r) => Math.abs(r.y - y) <= tolerance);
    if (!radek) {
      radek = { y, kusy: [] };
      radky.push(radek);
    }
    radek.kusy.push({ x, size, sirka: it.width ?? 0, str: it.str });
  }

  radky.sort((a, b) => b.y - a.y);          // v PDF roste y nahoru
  const vysledek = [];
  for (const radek of radky) {
    radek.kusy.sort((a, b) => a.x - b.x);
    let text = "";
    let konec = null;
    for (const k of radek.kusy) {
      if (konec !== null && k.x - konec > k.size * mezeraPomer) text += " ";
      text += k.str;
      konec = k.x + k.sirka;
    }
    text = text.trim();
    if (text !== "") vysledek.push(text);
  }
  return vysledek;
}

/** pdfjsLib se předává zvenčí, stejně jako ExcelJS jinde. */
export async function extractLines(pdfjsLib, source) {
  let data = source;
  if (source instanceof Blob) data = await source.arrayBuffer();
  // Cleanup žije na loading tasku vráceném z getDocument, ne na doc
  // proxy, kterou vrací uloha.promise -- doc.destroy neexistuje.
  const uloha = pdfjsLib.getDocument({ data: new Uint8Array(data) });
  const doc = await uloha.promise;
  const radky = [];
  for (let n = 1; n <= doc.numPages; n += 1) {
    const page = await doc.getPage(n);
    const obsah = await page.getTextContent();
    radky.push(...linesFromItems(obsah.items));
  }
  await uloha.destroy();
  return radky;
}
