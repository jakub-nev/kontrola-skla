"""Kontrola skla — okno: porovná objednávku skel (xlsx) s fakturou (pdf).

Spustit:  python glass_check.py
Veškeré porovnávání dělají invoice_parser, order_parser, matcher a report;
tohle je jen obal: nativní okno s webovým jádrem, vzhled je ve web/index.html.
"""
from __future__ import annotations

import json
import os
import sys
import traceback
from collections import Counter

import webview
from webview.dom import DOMEventHandler

from invoice_parser import parse_invoice
from matcher import match_items
from order_parser import parse_order
from report import result_row, write_report


def slozka_webu():
    """HTML se do .exe/.app balí přes --add-data, rozbalí se do sys._MEIPASS."""
    koren = getattr(sys, "_MEIPASS", os.path.dirname(os.path.abspath(__file__)))
    return os.path.join(koren, "web")


# Vedle spustitelného souboru se psát nedá (Program Files, podepsaný .app),
# domovský adresář jde vždy.
NASTAVENI = os.path.join(os.path.expanduser("~"), ".kontrola_skla")


def _nacti_tmavy():
    """Zapamatovaný režim. Chybějící i poškozené nastavení znamená světlý."""
    try:
        with open(NASTAVENI, encoding="utf-8") as f:
            return f.read().strip() == "tmavy"
    except OSError:
        return False


def _uloz_tmavy(tmavy):
    """Když se zapsat nedá, přepínač funguje dál -- jen si to nezapamatuje."""
    try:
        with open(NASTAVENI, "w", encoding="utf-8") as f:
            f.write("tmavy" if tmavy else "svetly")
    except OSError:
        pass


def _cesta(vybrano):
    """Dialog vrací podle platformy n-tici cest, nebo rovnou jednu cestu."""
    if not vybrano:
        return None
    return os.path.normpath(vybrano if isinstance(vybrano, str) else vybrano[0])


def _problemy(pocet):
    if pocet == 1:
        return "problém"
    return "problémy" if 2 <= pocet <= 4 else "problémů"


class Api:
    """Co smí zavolat stránka. Veškeré porovnávání zůstává v modulech vedle."""

    def __init__(self):
        self.vysledky = []

    def zaklad(self):
        return {"tmavy": _nacti_tmavy()}

    # --- soubory ---------------------------------------------------------
    def prochazet(self, pole):
        okna = webview.windows
        if not okna:
            return None
        typy = ("PDF (*.pdf)",) if pole == "pdf" else ("Excel (*.xlsx)",)
        return _cesta(okna[0].create_file_dialog(webview.FileDialog.OPEN,
                                                 file_types=typy))

    # --- pretazeni -------------------------------------------------------
    def dropnuto(self, cesty):
        """Roztridi pretazene soubory podle pripony do spravneho pole."""
        pole = {}
        for c in cesty:
            c = os.path.normpath(c)
            if c.lower().endswith(".pdf"):
                pole["pdf"] = c
            elif c.lower().endswith(".xlsx"):
                pole["xlsx"] = c
        if not pole:
            return {"hlaska": "Přetáhněte fakturu (*.pdf) nebo objednávku (*.xlsx)."}
        return pole

    # --- kontrola --------------------------------------------------------
    def zkontrolovat(self, pdf, xlsx):
        if not pdf or not xlsx:
            return {"stav": "Vyberte prosím oba soubory.", "klic": "varovna"}
        try:
            faktura = parse_invoice(pdf)
            objednavka = parse_order(xlsx)
        except Exception as chyba:
            traceback.print_exc()
            self.vysledky = []
            return {"chyba": f"Soubory se nepodařilo přečíst:\n\n{chyba}",
                    "stav": "Chyba při čtení souborů.", "klic": "varovna"}

        if not faktura:
            self.vysledky = []
            return {"chyba": "Formát faktury nebyl rozpoznán — "
                             "nenašel jsem žádné položky.",
                    "stav": "Formát faktury nebyl rozpoznán.", "klic": "varovna"}
        if not objednavka:
            self.vysledky = []
            return {"chyba": "V objednávce nebyly nalezeny žádné řádky.",
                    "stav": "Objednávka je prázdná.", "klic": "varovna"}

        self.vysledky = match_items(objednavka, faktura)
        pocty = Counter(v.status for v in self.vysledky)
        celkem, ok = len(self.vysledky), pocty["OK"]
        potize = celkem - ok
        return {
            "radky": [result_row(v) for v in self.vysledky],
            "bilance": {"celkem": celkem, "ok": ok, "rozdil": pocty["WARNING"],
                        "chybi": pocty["MISSING"], "navic": pocty["EXTRA"]},
            "stav": f"{faktura[0].provider} — {ok} z {celkem} položek v pořádku, "
                    f"{potize} {_problemy(potize)}",
            "klic": "varovna" if potize else "ok",
        }

    # --- report ----------------------------------------------------------
    def ulozit(self):
        okna = webview.windows
        if not self.vysledky or not okna:
            return {"ok": False,
                    "hlaska": "Není co ukládat — nejdřív spusťte kontrolu."}
        cesta = _cesta(okna[0].create_file_dialog(
            webview.FileDialog.SAVE, save_filename="kontrola_skla.xlsx",
            file_types=("Excel (*.xlsx)",)))
        if not cesta:
            return {"ok": False, "hlaska": ""}
        if not cesta.lower().endswith(".xlsx"):
            cesta += ".xlsx"
        try:
            write_report(self.vysledky, cesta)
        except Exception as chyba:
            traceback.print_exc()
            return {"ok": False, "hlaska": f"Report se nepodařilo uložit: {chyba}"}
        return {"ok": True, "hlaska": f"Report uložen: {cesta}"}

    def uloz_rezim(self, tmavy):
        _uloz_tmavy(bool(tmavy))


def _pripoj_drop(okno, api):
    """Cesty přetažených souborů dá jen Python -- prohlížeč zná pouze jména."""
    def upusteno(e):
        cesty = [f.get("pywebviewFullPath") for f in e["dataTransfer"]["files"]]
        odpoved = api.dropnuto([c for c in cesty if c])
        okno.evaluate_js(f"window.prijmiDropnute({json.dumps(odpoved)})")

    okno.dom.document.events.drop += DOMEventHandler(upusteno, True, True)


def main():
    api = Api()
    okno = webview.create_window(
        "Kontrola skla  ·  objednávka vs. faktura",
        os.path.join(slozka_webu(), "index.html"),
        js_api=api, width=1280, height=820, min_size=(960, 620),
        background_color="#ffffff")
    webview.start(lambda: _pripoj_drop(okno, api), private_mode=False)


if __name__ == "__main__":
    if "--kontrola" in sys.argv:
        # CI: zabalena binarka musi mit uvnitr web/, jinak by se otevrelo prazdno
        sys.exit(0 if os.path.isfile(os.path.join(slozka_webu(), "index.html")) else 1)
    main()
