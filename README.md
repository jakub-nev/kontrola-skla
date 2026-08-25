# Kontrola skla

Porovná objednávku skel (Excel) s fakturou od dodavatele (PDF) a upozorní na
rozdíly v rozměrech, počtech kusů a skladbě skla.

## Spuštění

    pip install pdfplumber openpyxl pywebview
    python glass_check.py

1. Vyberte fakturu (PDF) a objednávku (Excel) — přes **Procházet…**,
   nebo je přetáhněte myší do okna (pozná je podle přípony).
2. Klikněte na **Zkontrolovat** (nebo stiskněte Enter či F5).
3. Šedý pás nad poli shrne bilanci: kolik položek sedí, kolik se liší a kolik
   chybí nebo přebývá.
4. V tabulce mají zelený prah řádky v pořádku, okrový řádky s rozdílem
   (popsaným ve sloupci Problémy) a červený položky, které na faktuře chybí
   nebo jsou tam navíc.
5. **Uložit report** vytvoří barevný Excel s výsledky.

Přepínač vpravo nahoře přepíná světlý a tmavý režim; volba se pamatuje
v souboru `~/.kontrola_skla`.

Položky se párují podle rozměru (šířka × výška, případně prohozené) a
porovnává se počet kusů a skladba (tloušťky skel a meziskelní rámeček).

## Okno

Okno je nativní, obsah je webový: vzhled leží ve `web/index.html`
a `web/app.js`, veškeré porovnávání zůstává v Pythonu
(`invoice_parser.py`, `order_parser.py`, `matcher.py`, `report.py`).
`glass_check.py` je jen obal, který obojí spojuje.

`web/index.html` jde otevřít i přímo v prohlížeči — bez pywebview se stránka
naplní ukázkovými daty, takže se vzhled dá ladit bez spouštění aplikace.

## Testy

    pip install pytest
    pytest

## Hotové aplikace ke stažení

Binárky staví GitHub Actions (workflow `.github/workflows/build.yml`) — není
potřeba vlastní Mac ani nic instalovat. Push tagu `v*` spustí build a vydá
[release](https://github.com/jakub-nev/PDF_read/releases) se dvěma soubory:

- **Windows** — `KontrolaSkla.exe`, jeden soubor, stačí spustit. SmartScreen
  při prvním spuštění varuje: *Další informace* → *Přesto spustit*.
- **Mac** — `KontrolaSkla-intel.dmg`, Intel (x86_64) build, který běží nativně
  na Intel Macích i na Apple Silicon přes Rosetta. Poprvé aplikaci otevřete
  pravým tlačítkem → **Open**, jinak ji Gatekeeper zablokuje.

Ani jedna aplikace není podepsaná. Build jde spustit i ručně tlačítkem
**Run workflow** v záložce **Actions**; mezivýsledky pak leží v sekci
**Artifacts** daného běhu.
