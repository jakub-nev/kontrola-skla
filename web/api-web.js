// Prohlížečová varianta backendu. Stejné metody jako Python, jiná střeva:
// soubory drží File objekty, report se stahuje, režim jde do localStorage.
import { extractLines } from "./lib/pdf-lines.js";
import { parseInvoiceLines } from "./lib/invoice-parser.js";
import { parseOrder } from "./lib/order-parser.js";
import { matchItems } from "./lib/matcher.js";
import { reportBuffer, resultRow } from "./lib/report.js";

const KLIC_REZIM = "kontrola-skla:rezim";

function problemy(pocet) {
  if (pocet === 1) return "problém";
  return pocet >= 2 && pocet <= 4 ? "problémy" : "problémů";
}

export function webBackend(pdfjsLib, ExcelJS) {
  const soubory = { pdf: null, xlsx: null };
  let vysledky = [];

  const vyber = (id) => new Promise((hotovo) => {
    const vstup = document.getElementById(id === "pdf" ? "pdf-soubor" : "xlsx-soubor");
    vstup.onchange = () => {
      const f = vstup.files[0] ?? null;
      if (f) soubory[id] = f;
      hotovo(f ? f.name : null);
    };
    vstup.click();
  });

  return {
    prijmiSoubory(seznam) {          // drag and drop: rovnou File objekty
      const prijato = {};
      for (const f of seznam) {
        const jmeno = f.name.toLowerCase();
        if (jmeno.endsWith(".pdf")) { soubory.pdf = f; prijato.pdf = f.name; }
        else if (jmeno.endsWith(".xlsx")) { soubory.xlsx = f; prijato.xlsx = f.name; }
      }
      if (!prijato.pdf && !prijato.xlsx) {
        return { hlaska: "Přetáhněte fakturu (*.pdf) nebo objednávku (*.xlsx)." };
      }
      return prijato;
    },

    async zaklad() {
      return { tmavy: localStorage.getItem(KLIC_REZIM) === "tmavy" };
    },

    prochazet: (pole) => vyber(pole),

    async zkontrolovat() {
      if (!soubory.pdf || !soubory.xlsx) {
        return { stav: "Vyberte prosím oba soubory.", klic: "varovna" };
      }
      let faktura;
      let objednavka;
      try {
        faktura = parseInvoiceLines(await extractLines(pdfjsLib, soubory.pdf));
        objednavka = await parseOrder(ExcelJS, soubory.xlsx);
      } catch (chyba) {
        console.error(chyba);
        vysledky = [];
        return { chyba: `Soubory se nepodařilo přečíst:\n\n${chyba.message}`,
                 stav: "Chyba při čtení souborů.", klic: "varovna" };
      }
      if (!faktura.length) {
        vysledky = [];
        return { chyba: "Formát faktury nebyl rozpoznán — nenašel jsem žádné položky.",
                 stav: "Formát faktury nebyl rozpoznán.", klic: "varovna" };
      }
      if (!objednavka.length) {
        vysledky = [];
        return { chyba: "V objednávce nebyly nalezeny žádné řádky.",
                 stav: "Objednávka je prázdná.", klic: "varovna" };
      }

      vysledky = matchItems(objednavka, faktura);
      const pocty = { OK: 0, WARNING: 0, MISSING: 0, EXTRA: 0 };
      for (const v of vysledky) pocty[v.status] += 1;
      const celkem = vysledky.length;
      const potize = celkem - pocty.OK;
      return {
        radky: vysledky.map(resultRow),
        bilance: { celkem, ok: pocty.OK, rozdil: pocty.WARNING,
                   chybi: pocty.MISSING, navic: pocty.EXTRA },
        stav: `${faktura[0].provider} — ${pocty.OK} z ${celkem} položek v pořádku, `
               + `${potize} ${problemy(potize)}`,
        klic: potize ? "varovna" : "ok",
      };
    },

    async ulozit() {
      if (!vysledky.length) {
        return { ok: false, hlaska: "Není co ukládat — nejdřív spusťte kontrolu." };
      }
      let buf;
      try {
        buf = await reportBuffer(ExcelJS, vysledky);
      } catch (chyba) {
        console.error(chyba);
        return { ok: false, hlaska: `Report se nepodařilo uložit: ${chyba.message}` };
      }
      const url = URL.createObjectURL(new Blob([buf], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }));
      const a = document.createElement("a");
      a.href = url;
      a.download = "kontrola_skla.xlsx";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 0);
      return { ok: true, hlaska: "Report uložen: kontrola_skla.xlsx" };
    },

    uloz_rezim(tmavy) {
      localStorage.setItem(KLIC_REZIM, tmavy ? "tmavy" : "svetly");
    },
  };
}
