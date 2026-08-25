"""Okno je HTML: tyhle kontroly hlídají švy mezi app.js, index.html a Pythonem.

Rozbít je jde tiše — přejmenované id se v prohlížeči projeví jen tím, že
tlačítko přestane fungovat, a přepsaný název stavu jen tím, že řádek ztratí
barvu. Testy to zachytí dřív než uživatel.
"""
from __future__ import annotations

import re
from pathlib import Path

from report import HEADERS, STATUS_TEXT

WEB = Path(__file__).resolve().parent.parent / "web"
APP_JS = (WEB / "app.js").read_text(encoding="utf-8")
INDEX = (WEB / "index.html").read_text(encoding="utf-8")


def test_every_id_used_by_the_script_exists_in_the_page():
    used = set(re.findall(r'\$\("#([\w-]+)"\)', APP_JS))
    present = set(re.findall(r'id="([\w-]+)"', INDEX))
    assert used, "app.js by mělo sahat na prvky stránky"
    assert used <= present, f"chybí v index.html: {sorted(used - present)}"


def test_row_colours_cover_every_status():
    keys = set(re.findall(r'"([^"]+)": "s-[\w-]+"', APP_JS))
    assert keys == set(STATUS_TEXT.values())


def test_table_headers_match_the_report_columns():
    heads = re.search(r"const HLAVY = \[(.*?)\];", APP_JS, re.S).group(1)
    assert len(re.findall(r'"[^"]+"', heads)) == len(HEADERS)
