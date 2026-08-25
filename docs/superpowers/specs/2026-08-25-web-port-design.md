# Kontrola skla — Client-Side Web Port (GitHub Pages)

**Date:** 2026-08-25
**Status:** Approved

## Problem

The app ships as unsigned desktop binaries (~36 MB each), so both SmartScreen and
Gatekeeper warn on first launch. A browser version served from GitHub Pages would need no
install and no trust prompt, and would sit next to the user's other Pages app
(`jakub-nev.github.io/exc-suspension/`).

GitHub Pages serves static files only. There is no server to run Python on, so parsing,
matching and report generation must all run in the browser.

## Decisions already taken

**Route B — reimplement the logic in JavaScript** rather than run CPython in WebAssembly.

Pyodide (route A) was investigated and is viable: Pillow and cryptography ship with
Pyodide, pdfminer.six and openpyxl are pure Python and install via micropip, and
pdfplumber imports its only compiled dependency (pypdfium2, absent from Pyodide) lazily
inside `to_image()`, which this app never calls. It was rejected on first-load cost —
tens of MB of runtime before the page is usable.

**The desktop app stays untouched.** Whether to retire it is a later decision, to be made
once the web version has been used on real invoices. Until then the matching logic exists
twice, and that duplication is accepted with eyes open: every parser fix and every new
invoice format has to be made in both Python and JavaScript, or the two start disagreeing.

**No build step.** The desktop shell loads `web/index.html` straight off disk, so a
bundler would split the design into a source copy and a built copy. Plain ES modules,
libraries vendored into the repo.

**ExcelJS for both reading and writing.** The SheetJS community edition cannot write cell
fills and the report is colour-coded, so SheetJS would need a second library for writing
anyway. One library, ~950 kB, is the cheaper answer.

## Requirements

- Same behaviour as the desktop app: pick an invoice PDF and an order XLSX, check, see
  colour-coded results, save a colour-coded XLSX report.
- Same design. `web/index.html` and its CSS keep their current appearance.
- Nothing leaves the browser. Invoices are real customer documents; the page must never
  upload them.
- The desktop app keeps working from the same `web/` folder.

## Architecture

```
web/
  index.html        unchanged design; gains two hidden file inputs
  app.js            UI only; picks a backend at startup
  api-desktop.js    wrapper over window.pywebview.api
  api-web.js        browser implementation
  lib/
    pdf-lines.js       pdf.js text items -> array of lines
    invoice-parser.js  port of invoice_parser.py
    order-parser.js    port of order_parser.py
    matcher.js         port of matcher.py
    report.js          port of report.py, via ExcelJS
  vendor/
    pdf.mjs, pdf.worker.mjs, exceljs.min.js
```

### The backend seam

`app.js` already talks to a single object through `api()`. That object keeps the same five
methods in both backends, so the UI layer barely changes; the mock-data mode it uses today
for design work disappears, replaced by a browser backend that actually works.

| method | desktop | browser |
|---|---|---|
| `zaklad()` | dark mode from `~/.kontrola_skla` | dark mode from `localStorage` |
| `prochazet(pole)` | native dialog, returns a path | hidden file input, returns a file name |
| `zkontrolovat(pdf, xlsx)` | reads the two paths | uses the two held File objects, ignores the arguments |
| `ulozit()` | native save dialog, writes the file | ExcelJS buffer to a Blob, anchor download |
| `uloz_rezim(tmavy)` | writes the settings file | writes `localStorage` |

Selection happens once at startup: `window.pywebview` present means desktop, otherwise
browser. Drag and drop gets simpler in the browser — real File objects arrive in the drop
event, so the `pywebviewFullPath` round trip through Python is not needed.

The path fields show a file name rather than a full path in the browser. A browser cannot
learn the real path, and typing one in would be meaningless, so the fields become
read-only there.

### lib/pdf-lines.js

The only unit with no Python counterpart, and the one place the port can silently diverge.
pdfplumber returns finished lines; pdf.js returns text items with transform matrices. Lines
have to be rebuilt: group items by their y coordinate within a tolerance, sort each group
by x, and insert a space when the horizontal gap between neighbours exceeds a fraction of
the font size.

If that heuristic lands differently from the pdfplumber output, the invoice regexes quietly
return different items — no error, just wrong numbers. This is the main risk of the whole
port and the reason for the parity script below.

### lib/invoice-parser.js

Port of `invoice_parser.py`, split at the line boundary so the risky part is isolated:

- `parseInvoiceLines(lines)` — the item regex, the composition block state machine, and
  `parseComposition`. A pure function over an array of strings, testable with synthetic
  lines and no PDF at all.
- `parseInvoice(file)` — `pdf-lines.js` followed by `parseInvoiceLines`.

### lib/order-parser.js

ExcelJS reads the first worksheet; the rest is a straight port. Header matching keeps the
current rule: lowercase, strip diacritics, match a column when the normalised name equals
the prefix or starts with the prefix followed by a space or an open parenthesis.

### lib/matcher.js

Straight port of the two-pass pairing (exact dimensions first, swapped orientation second)
and the structure comparison.

### lib/report.js

ExcelJS workbook with the same headers, the same four fills, the same column widths, and
the same `result_row` shaping. `result_row` is shared with the table on screen, exactly as
`report.py` shares it today.

## Porting hazards

These are the places where a literal translation is wrong. Each needs a test.

- **Sorting numbers.** `sorted()` on floats compares numerically; the default JavaScript
  sort compares strings, so `[4, 33.2]` would sort as `[33.2, 4]`. Every numeric sort needs
  an explicit comparator.
- **Group ordering.** `matcher.py` relies on dict insertion order when emitting results.
  Use `Map`, not a plain object, so ordering is guaranteed whatever the key looks like.
- **Number formatting.** The Python `g` format renders 4.0 as "4" and 33.2 as "33.2"; plain
  string conversion in JavaScript happens to agree for these values, but the report and the
  problem strings must be checked against the Python output, not assumed.
- **Integer coercion.** `int(float(value))` truncates toward zero. `parseInt` on a float
  string and `Math.round` both differ; truncation is the required behaviour.
- **Diacritics.** The header normaliser strips combining marks after NFKD normalisation.
  JavaScript can do this natively, but the mark class has to be matched explicitly.
- **Odd-length check.** `parse_skladba` rejects an even count of values. Keep the rejection,
  and keep returning "unknown" rather than a guess — a false mismatch is worse than none.

## Error handling

The messages stay identical to the desktop app, including the empty-invoice and
empty-order cases, so the two versions read the same. Browser-specific failures (a PDF
pdf.js cannot open, a file the user cancelled) route into the existing
"Soubory se nepodařilo přečíst" path rather than growing new copy.

## Dependencies

Vendored into `web/vendor/`, no package manager at runtime:

- `pdfjs-dist` 6.2.108 — `build/pdf.mjs` plus `build/pdf.worker.mjs`
- `exceljs` 4.4.0 — `dist/exceljs.min.js`

Roughly 2.6 MB, which PyInstaller will also fold into the desktop binaries where it is dead
weight. On a 36 MB binary that is not worth excluding.

The same two packages are `devDependencies` in a `package.json`, because the Node tests
need a real reader to check what was written, and the parity script needs pdf.js outside a
browser. Nothing installs at runtime and the served page never resolves a bare specifier —
`npm run vendor` copies the three files out of `node_modules` into `web/vendor/`, and that
copy is committed.

Both libraries are passed in as arguments rather than imported by the `lib/` modules
(`parseOrder(ExcelJS, file)`, `extractLines(pdfjsLib, file)`). The browser hands over the
global from a plain script tag, Node hands over the `node_modules` import, and the pure
logic stays importable with no library at all.

## Testing

`node --test`, which ships with Node. No test framework; the only installed packages are
the two libraries listed under Dependencies, present so the tests can read back what the
code wrote.

Mirrored from the Python suite:

- `parseComposition` and `parseSkladba` — 8 pure tests, one to one
- `matcher` — 13 tests, one to one, all on constructed objects
- `order-parser` against `objednavka_sklo_VltavaHolding_16.9.25.xlsx`, which is committed
- `invoice-parser` against synthetic lines, since the real invoice is git-ignored
- `report` — write a workbook to a buffer, read it back, check headers and one fill

Not mirrored, and deliberately so:

- `scripts/parita.mjs` — run locally against a real invoice and order. Runs the JavaScript
  path in Node, shells out to the existing Python modules for the same two files, and diffs
  the two result sets row by row. This is the only check that can catch a
  line-reconstruction difference, and it cannot run in CI because the invoice must not be
  committed.

CI runs the Node tests. The Python suite stays out of CI for the reason already recorded in
`build.yml` — six of its tests need the git-ignored invoice — and is unchanged by this
work. The parity script is a local tool and the README says so.

## Deployment

A `pages.yml` workflow uploads `web/` via `upload-pages-artifact` and deploys it, with the
Pages source set to GitHub Actions. The site lands at `jakub-nev.github.io/kontrola-skla/`.

The existing `build.yml` is untouched: pushing a `v*` tag still builds and releases the
desktop binaries.

## Out of scope

- Retiring the desktop app or deleting any Python.
- Service worker, offline install, or any change to the parsing rules.
- Changing what the app does. This is a port, not a feature.
