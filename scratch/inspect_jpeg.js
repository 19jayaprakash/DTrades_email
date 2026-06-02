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
    let i = 2; // skip FFD8
    let dimensions = "unknown";
    while (i < buffer.length) {
      if (buffer[i] === 0xFF) {
        const marker = buffer[i + 1];
        if (marker === 0xC0 || marker === 0xC2) {
          // SOF0 or SOF2
          // Length: buffer.readUInt16BE(i + 2)
          // Precision: buffer[i + 4]
          // Height: buffer.readUInt16BE(i + 5)
          // Width: buffer.readUInt16BE(i + 7)
          const height = buffer.readUInt16BE(i + 5);
          const width = buffer.readUInt16BE(i + 7);
          dimensions = `${width}x${height}px`;
          break;
        }
        i += 2 + buffer.readUInt16BE(i + 2);
      } else {
        i++;
      }
    }
    console.log(`${path.basename(file)}: ${dimensions}`);
  } catch (err) {
    console.error(`Error reading ${file}:`, err.message);
  }
}
