// Port matcher.py. Skupiny drží Map, ne objekt -- pořadí vkládání je součást
// algoritmu a u objektu ho jazyk negarantuje.

const klic = (w, h) => `${w}x${h}`;
const fmt = (hodnoty) => hodnoty.map((v) => String(v)).join("/");

/** Rozdíly ve skladbě; [] i tehdy, když se porovnat nedá. */
function potizeSkladby(o, inv) {
  const potize = [];
  if (o.panes === null || !inv.panes || inv.panes.length === 0) return potize;
  if (o.panes.length !== inv.panes.length) {
    potize.push(`počet skel: objednáno ${o.panes.length}, faktura ${inv.panes.length}`);
  } else {
    const a = [...o.panes].sort((x, y) => x - y);
    const b = [...inv.panes].sort((x, y) => x - y);
    if (a.some((v, i) => v !== b[i])) {
      potize.push(`tloušťky skel: objednáno ${fmt(o.panes)}, faktura ${fmt(inv.panes)}`);
    }
  }
  if (o.gaps && o.gaps.length && inv.spacer !== null && inv.spacer !== undefined) {
    if (o.gaps.some((g) => g !== inv.spacer)) {
      potize.push(`rámeček: objednáno ${fmt(o.gaps)} mm, faktura ${inv.spacer} mm`);
    }
  }
  return potize;
}

function seskup(polozky) {
  const skupiny = new Map();
  for (const it of polozky) {
    const k = klic(it.width, it.height);
    if (!skupiny.has(k)) skupiny.set(k, []);
    skupiny.get(k).push(it);
  }
  return skupiny;
}

export function matchItems(orderItems, invoiceItems) {
  const fakturaSkupiny = seskup(invoiceItems);
  const objednavkaSkupiny = seskup(orderItems);

  // Dvě kola, aby prohozený rozměr nikdy nesebral fakturační řádek, který
  // potřebuje řádek s přesným rozměrem: nejdřív přesné, pak teprve prohozené.
  const parovani = new Map();
  const cekaji = [];
  for (const [k, skupina] of objednavkaSkupiny) {
    const fakturaSkupina = fakturaSkupiny.get(k);
    if (fakturaSkupina !== undefined) {
      fakturaSkupiny.delete(k);
      parovani.set(k, [fakturaSkupina, false]);
    } else {
      cekaji.push([k, skupina]);
    }
  }
  for (const [k, skupina] of cekaji) {
    const prohozeny = klic(skupina[0].height, skupina[0].width);
    const fakturaSkupina = fakturaSkupiny.get(prohozeny);
    if (fakturaSkupina !== undefined) {
      fakturaSkupiny.delete(prohozeny);
      parovani.set(k, [fakturaSkupina, true]);
    }
  }

  const vysledky = [];
  for (const [k, objednavkaSkupina] of objednavkaSkupiny) {
    const par = parovani.get(k);
    if (par === undefined) {
      for (const o of objednavkaSkupina) {
        vysledky.push({ status: "MISSING", orderItem: o, invoiceItem: null,
                        problems: [`rozměr ${o.width} x ${o.height} na faktuře chybí`] });
      }
      continue;
    }
    const [fakturaSkupina, prohozeno] = par;

    const spolecne = [];
    if (prohozeno) spolecne.push("prohozená šířka × výška na faktuře");
    const objednano = objednavkaSkupina.reduce((s, o) => s + o.quantity, 0);
    const fakturovano = fakturaSkupina.reduce((s, i) => s + i.quantity, 0);
    if (objednano !== fakturovano) {
      spolecne.push(`počet kusů: objednáno ${objednano}, fakturováno ${fakturovano}`);
    }

    // Ve skupině stejného rozměru se přednostně páruje řádek, jehož skladba sedí,
    // aby dvě položky téhož rozměru a různého typu našly každá tu svou.
    const zbyva = [...fakturaSkupina];
    for (const o of objednavkaSkupina) {
      let inv = zbyva.find((i) => potizeSkladby(o, i).length === 0);
      if (inv === undefined) inv = (zbyva.length ? zbyva : fakturaSkupina)[0];
      const kde = zbyva.indexOf(inv);
      if (kde !== -1) zbyva.splice(kde, 1);
      const problems = [...spolecne, ...potizeSkladby(o, inv)];
      vysledky.push({ status: problems.length ? "WARNING" : "OK",
                      orderItem: o, invoiceItem: inv, problems });
    }
  }

  for (const fakturaSkupina of fakturaSkupiny.values()) {
    for (const it of fakturaSkupina) {
      vysledky.push({ status: "EXTRA", orderItem: null, invoiceItem: it,
                      problems: [`rozměr ${it.width} x ${it.height} nebyl objednán`] });
    }
  }
  return vysledky;
}
