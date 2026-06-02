import fs from "fs";
import path from "path";

const files = [
  "e:\\Dtrades_email\\DTrades_email\\artifacts\\email-crm\\public\\airline_export.png",
  "e:\\Dtrades_email\\DTrades_email\\artifacts\\email-crm\\public\\export_masala.png",
  "e:\\Dtrades_email\\DTrades_email\\artifacts\\email-crm\\public\\essentials.png"
];

for (const file of files) {
  try {
    const buffer = fs.readFileSync(file);
    const hex = buffer.slice(0, 16).toString("hex").toUpperCase();
    const ascii = buffer.slice(0, 16).toString("ascii").replace(/[^\x20-\x7E]/g, ".");
    console.log(`${path.basename(file)}:`);
    console.log(`  Hex:   ${hex}`);
    console.log(`  ASCII: ${ascii}`);
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
}
