"use strict";
/* Obsluha okna. Veskere porovnavani zustava v Pythonu, tohle jen vola api a kresli. */

const $ = (s) => document.querySelector(s);

/* Bez pywebview (tj. v prohlizeci pri ladeni vzhledu) se pouziji ukazkova data,
   at jde stranka otevrit a doladit bez spousteni cele aplikace.
   Pozor: window.pywebview vznika az po nacteni skriptu, takze se to nesmi
   rozhodovat hned pri parsovani -- jinak bezi na ukazkach i v aplikaci. */
let UKAZKA = true;
const api = () => window.pywebview.api;

const MOCK = {
  bilance: { celkem: 4, ok: 1, rozdil: 1, chybi: 1, navic: 1 },
  radky: [
    ["OK", "Kanceláře", "1", "1346 x 975", "1346 x 975", "6", "6",
     "4-16-4-16-4", "SGG PXN 4mm / PLC 4mm / PXN 4mm | rámeček 16 mm", ""],
    ["rozdíl", "Kanceláře", "2", "550 x 845", "550 x 845", "3", "2",
     "4-18-4-18-4", "SGG PXN 4mm / PLC 4mm / PXN 4mm | rámeček 16 mm",
     "počet kusů: objednáno 3, fakturováno 2; rámeček: objednáno 18/18 mm, faktura 16 mm"],
    ["chybí na faktuře", "Sklad", "3", "2335 x 1350", "", "1", "",
     "33.2-16-4-16-6", "", "rozměr 2335 x 1350 na faktuře chybí"],
    ["navíc na faktuře", "", "007", "", "915 x 1965", "", "1",
     "", "SGG PXN 6mm / PLC 4mm | rámeček 20 mm", "rozměr 915 x 1965 nebyl objednán"],
  ],
};

/* ---------- vykreslovani ---------- */
const KLICE = { "OK": "s-ok", "rozdíl": "s-warning",
                "chybí na faktuře": "s-missing", "navíc na faktuře": "s-extra" };
const CISELNE = new Set([3, 4, 5, 6]);        // rozmery a kusy zarovnane doprava
const HLAVY = ["Stav", "Objekt", "Pozice", "Rozměr obj.", "Rozměr fakt.", "Ks obj.",
               "Ks fakt.", "Skladba obj.", "Skladba fakt.", "Problémy"];

const chran = (s) => String(s).replace(/[&<>]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[c]));

function kresliBilanci(b) {
  const polozky = [
    ["Položek", b.celkem, ""],
    ["V pořádku", b.ok, b.ok ? "je-ok" : ""],
    ["Rozdíly", b.rozdil, b.rozdil ? "je-pozor" : ""],
    ["Chybí na faktuře", b.chybi, b.chybi ? "je-warn" : ""],
    ["Navíc na faktuře", b.navic, b.navic ? "je-warn" : ""],
  ];
  $("#bilance").innerHTML = polozky
    .map(([popis, pocet, klic]) => `<div><dt>${popis}</dt><dd class="${klic}">${pocet}</dd></div>`)
    .join("");
}

function kresliVysledky(radky) {
  if (!radky.length) {
    $("#vysledky").innerHTML = '<p class="prazdno">Faktura ani objednávka neobsahují žádné položky k porovnání.</p>';
    return;
  }
  const bunky = (r) => r.map((v, i) =>
    `<td class="${CISELNE.has(i) ? "cislo" : ""}${i === 9 && v ? " potize" : ""}">${chran(v)}</td>`).join("");
  $("#vysledky").innerHTML = `<table>
    <thead><tr>${HLAVY.map((h, i) =>
      `<th class="${CISELNE.has(i) ? "cislo" : ""}">${h}</th>`).join("")}</tr></thead>
    <tbody>${radky.map((r) =>
      `<tr class="${KLICE[r[0]] || ""}">${bunky(r)}</tr>`).join("")}</tbody>
  </table>`;
}

function kresliChybu(text) {
  $("#vysledky").innerHTML = `<p class="prazdno chyba">${chran(text)}</p>`;
}

function nastavStav(text, klic) {
  $("#stav").className = "stav " + (klic || "");
  $("#stav-text").textContent = text;
}

/* ---------- rezim ---------- */
function nastavRezim(tmavy) {
  document.documentElement.dataset.rezim = tmavy ? "tmavy" : "svetly";
  if (!UKAZKA) api().uloz_rezim(tmavy);
}

/* ---------- akce ---------- */
const PRAZDNA_BILANCE = { celkem: 0, ok: 0, rozdil: 0, chybi: 0, navic: 0 };

async function zkontrolovat() {
  if (UKAZKA) { nastavStav("Ukázková data — kontrola běží jen v aplikaci.", "varovna"); return; }
  nastavStav("Čtu soubory…", "");
  const v = await api().zkontrolovat($("#pdf").value, $("#xlsx").value);
  if (v.chyba !== undefined) {                   // necteme, nemame co ukladat
    kresliChybu(v.chyba);
    kresliBilanci(PRAZDNA_BILANCE);
    $("#ulozit").disabled = true;
  } else if (v.radky) {
    kresliVysledky(v.radky);
    kresliBilanci(v.bilance);
    $("#ulozit").disabled = !v.radky.length;
  }
  nastavStav(v.stav, v.klic);                    // chybejici soubor necha tabulku byt
}

/* ---------- prihlaseni udalosti ---------- */
document.addEventListener("click", async (e) => {
  const proch = e.target.closest("[data-prochazet]");
  if (proch && !UKAZKA) {
    const pole = $("#" + proch.dataset.prochazet);
    const cesta = await api().prochazet(pole.id);
    if (cesta) pole.value = cesta;
    return;
  }
  if (e.target.closest("#rezim")) {
    nastavRezim(document.documentElement.dataset.rezim !== "tmavy");
  } else if (e.target.closest("#zkontrolovat")) {
    zkontrolovat();
  } else if (e.target.closest("#ulozit") && !UKAZKA) {
    const v = await api().ulozit();
    if (v.hlaska) nastavStav(v.hlaska, v.ok ? "ok" : "varovna");
  }
});

document.addEventListener("keydown", (e) => {
  if (e.key === "F5" || (e.key === "Enter" && e.target.tagName !== "BUTTON")) {
    e.preventDefault(); zkontrolovat();
  }
});

/* Pretazeni: zvyrazneni resi CSS, cesty dodava Python pres pywebviewFullPath. */
["dragenter", "dragover"].forEach((u) => document.addEventListener(u, (e) => {
  e.preventDefault(); document.body.classList.add("pretahuje");
}));
["dragleave", "drop"].forEach((u) => document.addEventListener(u, (e) => {
  if (u === "drop" || !e.relatedTarget) document.body.classList.remove("pretahuje");
}));

window.prijmiDropnute = function (v) {           // vola Python po dropu
  if (v.pdf) $("#pdf").value = v.pdf;
  if (v.xlsx) $("#xlsx").value = v.xlsx;
  nastavStav(v.hlaska || "Soubory načteny — stiskněte Zkontrolovat.",
             v.hlaska ? "varovna" : "");
};

async function start() {
  if (UKAZKA) {                                  // ladeni vzhledu v prohlizeci
    kresliBilanci(MOCK.bilance);
    kresliVysledky(MOCK.radky);
    $("#ulozit").disabled = false;
    return;
  }
  kresliBilanci(PRAZDNA_BILANCE);
  const z = await api().zaklad();
  document.documentElement.dataset.rezim = z.tmavy ? "tmavy" : "svetly";
}

let spusteno = false;
function spustit() {
  if (spusteno) return;
  spusteno = true;
  UKAZKA = !window.pywebview;
  start();
}
window.addEventListener("pywebviewready", spustit, { once: true });
setTimeout(spustit, 700);        // v prohlizeci pywebviewready nikdy neprijde
