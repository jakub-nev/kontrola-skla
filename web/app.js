"use strict";
/* Obsluha okna. Porovnávání dělá backend -- v aplikaci Python, v prohlížeči
   lib/. Tenhle soubor jen kreslí a sbírá kliknutí. */

import { desktopBackend } from "./api-desktop.js";
import { webBackend } from "./api-web.js";

const $ = (s) => document.querySelector(s);

let backend = null;
let DESKTOP = false;
const api = () => backend;

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
  api().uloz_rezim(tmavy);
}

/* ---------- akce ---------- */
const PRAZDNA_BILANCE = { celkem: 0, ok: 0, rozdil: 0, chybi: 0, navic: 0 };

async function zkontrolovat() {
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
  if (proch) {
    const pole = $("#" + proch.dataset.prochazet);
    const cesta = await api().prochazet(pole.id);
    if (cesta) pole.value = cesta;
    return;
  }
  if (e.target.closest("#rezim")) {
    nastavRezim(document.documentElement.dataset.rezim !== "tmavy");
  } else if (e.target.closest("#zkontrolovat")) {
    zkontrolovat();
  } else if (e.target.closest("#ulozit")) {
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

window.prijmiDropnute = function (v) {           // volá Python po dropu
  if (v.pdf) $("#pdf").value = v.pdf;
  if (v.xlsx) $("#xlsx").value = v.xlsx;
  nastavStav(v.hlaska || "Soubory načteny — stiskněte Zkontrolovat.",
             v.hlaska ? "varovna" : "");
};

document.addEventListener("drop", (e) => {
  if (DESKTOP) return;                           // cesty dodá Python
  e.preventDefault();
  window.prijmiDropnute(backend.prijmiSoubory([...e.dataTransfer.files]));
});

async function start() {
  kresliBilanci(PRAZDNA_BILANCE);
  const z = await api().zaklad();
  document.documentElement.dataset.rezim = z.tmavy ? "tmavy" : "svetly";
}

async function spustit() {
  DESKTOP = Boolean(window.pywebview);
  if (DESKTOP) {
    backend = desktopBackend();
  } else {
    const pdfjsLib = await import("./vendor/pdf.mjs");
    pdfjsLib.GlobalWorkerOptions.workerSrc = "./vendor/pdf.worker.mjs";
    backend = webBackend(pdfjsLib, window.ExcelJS);
    $("#pdf").readOnly = true;                   // prohlížeč cestu nezná
    $("#xlsx").readOnly = true;
  }
  start();
}

let spusteno = false;
function jednou() {
  if (spusteno) return;
  spusteno = true;
  spustit();
}
window.addEventListener("pywebviewready", jednou, { once: true });
setTimeout(jednou, 700);        // v prohlížeči pywebviewready nikdy nepřijde
