// Kopie knihoven z node_modules do web/vendor/. Vendor se commituje, aby
// stránka nikdy nic neřešila za běhu -- tohle je jen obnova těch kopií.
import { copyFile, mkdir } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const KOREN = join(dirname(fileURLToPath(import.meta.url)), "..");
const CIL = join(KOREN, "web", "vendor");

const SOUBORY = [
  ["pdfjs-dist/build/pdf.mjs", "pdf.mjs"],
  ["pdfjs-dist/build/pdf.worker.mjs", "pdf.worker.mjs"],
  ["exceljs/dist/exceljs.min.js", "exceljs.min.js"],
];

await mkdir(CIL, { recursive: true });
for (const [zdroj, jmeno] of SOUBORY) {
  await copyFile(join(KOREN, "node_modules", zdroj), join(CIL, jmeno));
  console.log("vendor:", jmeno);
}
