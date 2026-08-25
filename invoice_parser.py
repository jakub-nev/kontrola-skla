"""Read a supplier document (invoice or quotation) into InvoiceItem objects.

Two suppliers, two unrelated layouts. Each is a pure function over the lines
pdfplumber returns, so both are testable without a PDF -- the real documents are
customer data and stay out of the repo. parse_invoice tries each in turn and
keeps whichever finds items.
"""
from __future__ import annotations

import re
from pathlib import Path

import pdfplumber

from models import InvoiceItem

GLASSOLUTIONS = "Glassolutions"
NONSTOP = "Sklenářství NONSTOP"

# --- Glassolutions ----------------------------------------------------------
# Diagnostic note: pdfplumber emits "1346 x975" (no space before H after 'x'),
# so the regex uses \s*x\s* to allow zero or more spaces around the 'x'.
#
# 001 kanceláře 6 1346 x975 16mm SWS Černý 21 1412.40 8474.40
# pol(3) [label] qty W x H spacer"mm" rest
_ITEM_RE = re.compile(
    r"^(?P<pos>\d{3})\s+"
    r"(?:(?P<label>\S+)\s+)?"
    r"(?P<qty>\d+)\s+"
    r"(?P<w>\d+)\s*x\s*(?P<h>\d+)\s+"
    r"(?P<spacer>\d+)\s*mm\b",
    re.IGNORECASE,
)

# 4mm / 4 mm -> pane thickness; bare decimal like 33.2 -> laminated pane.
# Bare integers without "mm" (e.g. "OR 572", VAT "21") must NOT match.
_PANE_RE = re.compile(r"(?P<mm>\d+(?:[.,]\d+)?)\s*mm|(?P<lam>\d+[.,]\d+)")

# Lines worth appending to a composition block must mention a thickness.
_THICKNESS_HINT_RE = re.compile(r"\d+\s*mm|\d+[.,]\d+")


def parse_composition(text: str) -> list[float]:
    """Extract ordered pane thicknesses from a composition description."""
    panes: list[float] = []
    for m in _PANE_RE.finditer(text):
        value = m.group("mm") or m.group("lam")
        panes.append(float(value.replace(",", ".")))
    return panes


def parse_glassolutions_lines(lines: list[str]) -> list[InvoiceItem]:
    """One line per item; its composition sits in an SGG block above it."""
    items: list[InvoiceItem] = []
    comp_lines: list[str] = []
    in_comp_block = False

    for line in lines:
        line = line.strip()
        m = _ITEM_RE.match(line)
        if m:
            in_comp_block = False
            composition = " ".join(comp_lines)
            items.append(InvoiceItem(
                position=m.group("pos"),
                label=m.group("label") or "",
                quantity=int(m.group("qty")),
                width=int(m.group("w")),
                height=int(m.group("h")),
                spacer=int(m.group("spacer")),
                composition_raw=composition,
                panes=parse_composition(composition),
                provider=GLASSOLUTIONS,
            ))
        elif line.startswith("SGG"):
            comp_lines = [line]
            in_comp_block = True
        elif in_comp_block and _THICKNESS_HINT_RE.search(line):
            comp_lines.append(line)
        elif in_comp_block:
            in_comp_block = False  # block ended without an item yet; keep comp_lines
    return items


# --- Sklenářství NONSTOP ----------------------------------------------------
# Celkem: 6 Ks. 1019 x 1125 211.46 1,229.00 7,374.00
_NONSTOP_ITEM_RE = re.compile(
    r"^Celkem:\s*(?P<qty>\d+)\s*Ks\.\s*(?P<w>\d+)\s*x\s*(?P<h>\d+)\b")

# "Pozice zákazníka: Morbicer" -- the customer's own position label is printed
# on the line above it.
_NONSTOP_POSITION_RE = re.compile(r"^Pozice zákazníka:")

# A composition line is the item number followed by the make-up, e.g.
# "1 4 iplus 1.1 18 TPS 4 FL 18 TPS 4 iplus 1.1 Ar U 0,5".
_NONSTOP_COMPOSITION_RE = re.compile(r"^\d+\s+(?P<slozeni>\d+(?:[.,]\d+)?\s+\S.*)$")

# The spacer marker. Anchoring on it is what makes the make-up readable at all:
# "iplus 1.1" is a product code and "U 0,5" a heat-transfer coefficient, so
# neither may be read as glass. Numbers marked by TPS are the cavities; the
# leading number of each stretch between them is a pane. An unknown spacer type
# yields nothing, and the matcher then skips the make-up check rather than
# inventing a mismatch.
_NONSTOP_SPACER_RE = re.compile(r"(\d+(?:[.,]\d+)?)\s+TPS\b")
_LEADING_NUMBER_RE = re.compile(r"\s*(\d+(?:[.,]\d+)?)")


def _cislo(text: str) -> float:
    return float(text.replace(",", "."))


def parse_nonstop_composition(text: str) -> tuple[list[float], list[float]]:
    """'4 iplus 1.1 18 TPS 4 FL' -> ([4, 4], [18]). No TPS marker -> ([], [])."""
    gaps = [_cislo(m.group(1)) for m in _NONSTOP_SPACER_RE.finditer(text)]
    if not gaps:
        return [], []
    panes: list[float] = []
    for stretch in _NONSTOP_SPACER_RE.split(text)[::2]:
        m = _LEADING_NUMBER_RE.match(stretch)
        if m:
            panes.append(_cislo(m.group(1)))
    return panes, gaps


def parse_nonstop_lines(lines: list[str]) -> list[InvoiceItem]:
    """Each item spans several lines and ends with its "Celkem:" summary."""
    items: list[InvoiceItem] = []
    label = ""
    composition = ""
    predchozi = ""

    for line in lines:
        line = line.strip()
        if _NONSTOP_POSITION_RE.match(line):
            label = predchozi
            composition = ""     # a new item starts; do not inherit the last make-up
        else:
            m = _NONSTOP_COMPOSITION_RE.match(line)
            if m and "TPS" in line:
                composition = m.group("slozeni")
            else:
                m = _NONSTOP_ITEM_RE.match(line)
                if m:
                    panes, gaps = parse_nonstop_composition(composition)
                    items.append(InvoiceItem(
                        position=str(len(items) + 1),
                        label=label,
                        quantity=int(m.group("qty")),
                        width=int(m.group("w")),
                        height=int(m.group("h")),
                        spacer=int(gaps[0]) if gaps else None,
                        composition_raw=composition,
                        panes=panes,
                        provider=NONSTOP,
                    ))
        predchozi = line
    return items


# --- entry point ------------------------------------------------------------

_LAYOUTS = (parse_glassolutions_lines, parse_nonstop_lines)


def parse_invoice(path: str | Path) -> list[InvoiceItem]:
    """Read the document, trying each known layout until one finds items."""
    with pdfplumber.open(str(path)) as pdf:
        lines = [
            line
            for page in pdf.pages
            for line in (page.extract_text() or "").split("\n")
        ]

    for layout in _LAYOUTS:
        items = layout(lines)
        if items:
            return items
    return []
