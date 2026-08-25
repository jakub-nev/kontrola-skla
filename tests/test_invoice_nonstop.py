"""Sklenářství NONSTOP quotations: a second, unrelated invoice layout.

The real document is git-ignored customer data, so these run on synthetic lines
copied from it. The traps are real: in "4 iplus 1.1 18 TPS 4 FL", the 1.1 is a
product designation and the 0,5 at the end is a U-value — neither is glass.
"""
from __future__ import annotations

from invoice_parser import parse_nonstop_lines

# One item, laid out exactly as pdfplumber returns it.
POLOZKA = [
    "Zakázka zákazníka: Cenová nabídka",
    "1,1.1",
    "Pozice zákazníka: Morbicer",
    "1 4 iplus 1.1 18 TPS 4 FL 18 TPS 4 iplus 1.1 Ar U 0,5",
    "Cena zákl. složení IZO 1,059.0 m2 1.16 1,228.44 0.00 % 7,374.0",
    "Srážení hran Hrana 1/2/3/4 m=4.30 0.00 m 4.30 0.00 0.00 % 0.00",
    "Celkem: 6 Ks. 1019 x 1125 211.46 1,229.00 7,374.00",
]


def test_reads_quantity_and_dimensions():
    [it] = parse_nonstop_lines(POLOZKA)
    assert (it.quantity, it.width, it.height) == (6, 1019, 1125)


def test_triple_glazing_panes_and_spacer():
    [it] = parse_nonstop_lines(POLOZKA)
    assert it.panes == [4.0, 4.0, 4.0]
    assert it.spacer == 18


def test_product_code_and_u_value_are_not_glass():
    # "iplus 1.1" and "U 0,5" would both look like laminated panes to a naive parser
    [it] = parse_nonstop_lines(POLOZKA)
    assert 1.1 not in it.panes
    assert 0.5 not in it.panes


def test_double_glazing():
    [it] = parse_nonstop_lines([
        "Pozice zákazníka: Nemec",
        "12 6 FL 16 TPS 4 iplus 1.1 Ar U 1,1",
        "Celkem: 8 Ks. 707 x 975 140.53 667.00 5,336.00",
    ])
    assert it.panes == [6.0, 4.0]
    assert it.spacer == 16
    assert (it.quantity, it.width, it.height) == (8, 707, 975)


def test_pane_order_is_kept_as_printed():
    # 4 Crepi first, 6 iplus second -- the matcher sorts before comparing,
    # but the report shows what the supplier actually wrote
    [it] = parse_nonstop_lines([
        "Pozice zákazníka: Nemec",
        "16 4 Crepi 16 TPS 6 iplus 1.1 Ar U 1,1",
        "Celkem: 2 Ks. 605 x 545 16.94 514.00 1,028.00",
    ])
    assert it.panes == [4.0, 6.0]


def test_product_name_with_dots_survives():
    [it] = parse_nonstop_lines([
        "Pozice zákazníka: Nemec",
        "15 6 ST.CL.CLEA 16 TPS 4 iplus 1.1 Ar U 1,1",
        "Celkem: 1 Ks. 805 x 1780 36.34 1,381.00 1,381.00",
    ])
    assert it.panes == [6.0, 4.0]


def test_label_comes_from_the_line_above_pozice():
    [it] = parse_nonstop_lines(POLOZKA)
    assert it.label == "1,1.1"


def test_provider_is_recorded():
    [it] = parse_nonstop_lines(POLOZKA)
    assert it.provider == "Sklenářství NONSTOP"


def test_address_line_is_not_mistaken_for_a_composition():
    # "150 00 Praha 5-Smíchov" starts with digits like a composition line does
    items = parse_nonstop_lines([
        "SKLENÁŘSTVÍ NONSTOP plus s.r.o. Nabídka č. 2000081",
        "150 00 Praha 5-Smíchov",
        "Pozice zákazníka: Morbicer",
        "2 4 iplus 1.1 18 TPS 4 FL 18 TPS 4 iplus 1.1 Ar U 0,5",
        "Celkem: 1 Ks. 722 x 1216 27.11 954.00 954.00",
    ])
    assert len(items) == 1
    assert items[0].panes == [4.0, 4.0, 4.0]


def test_no_items_for_an_unrelated_document():
    assert parse_nonstop_lines(["001 kanceláře 6 1346 x975 16mm SWS Černý"]) == []
