// Port report.py. resultRow slouží tabulce na obrazovce i sešitu, stejně
// jako result_row v Pythonu.

export const STATUS_TEXT = {
  OK: "OK",
  WARNING: "rozdíl",
  MISSING: "chybí na faktuře",
  EXTRA: "navíc na faktuře",
};

const VYPLNE = {
  OK: "FFC6EFCE",        // zelená
  WARNING: "FFFFEB9C",   // oranžová
  MISSING: "FFFFC7CE",   // červená
  EXTRA: "FFFFC7CE",
};

export const HEADERS = ["Stav", "Objekt", "Pozice", "Rozměr objednávka",
  "Rozměr faktura", "Ks objednáno", "Ks fakturováno", "Skladba objednávka",
  "Skladba faktura", "Problémy"];

const SIRKY = [16, 16, 10, 16, 16, 12, 12, 24, 40, 50];

export function resultRow(r) {
  const o = r.orderItem;
  const i = r.invoiceItem;
  return [
    STATUS_TEXT[r.status],
    o ? o.objekt : "",
    o ? o.label : (i ? i.label : ""),
    o ? `${o.width} x ${o.height}` : "",
    i ? `${i.width} x ${i.height}` : "",
    o ? String(o.quantity) : "",
    i ? String(i.quantity) : "",
    o ? o.skladbaRaw : "",
    i ? `${i.compositionRaw} | rámeček ${i.spacer} mm` : "",
    r.problems.join("; "),
  ];
}

/** ExcelJS se předává zvenčí, stejně jako u order-parseru. */
/** Od kterého dodavatele report je. Excel má strop 31 znaků na název listu. */
export function sheetTitle(results) {
  const r = results.find((v) => v.invoiceItem);
  const provider = r ? r.invoiceItem.provider : "";
  return provider ? `Kontrola — ${provider}`.slice(0, 31) : "Kontrola";
}

export async function reportBuffer(ExcelJS, results) {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet(sheetTitle(results));
  ws.addRow(HEADERS).font = { bold: true };
  for (const r of results) {
    const row = ws.addRow(resultRow(r));
    row.eachCell({ includeEmpty: true }, (cell) => {
      cell.fill = { type: "pattern", pattern: "solid",
                    fgColor: { argb: VYPLNE[r.status] } };
    });
  }
  SIRKY.forEach((sirka, i) => { ws.getColumn(i + 1).width = sirka; });
  return wb.xlsx.writeBuffer();
}
