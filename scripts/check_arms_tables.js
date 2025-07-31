// Script CommonJS para revisar y corregir el campo "Result" en los archivos JSON:
// Si "Result" es number, lo convierte a string y guarda el archivo corregido.

const fs = require("fs");
const path = require("path");

/**
 * Revisa todos los archivos JSON de un directorio y:
 * - Si algún campo "Result" es number, lo convierte a string y guarda el archivo corregido.
 * - Reporta si algún campo "Result" es un objeto (o distinto de número/string).
 * @param {string} dir Ruta absoluta al directorio a procesar
 */
function checkAndFixResultFields(dir) {
  const files = fs.readdirSync(dir);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(dir, file);
    let content;
    try {
      content = fs.readFileSync(filePath, "utf8");
    } catch (e) {
      console.warn(`No se pudo leer ${file}:`, e);
      continue;
    }
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.warn(`No se pudo parsear ${file}:`, e);
      continue;
    }
    // Busca el array de filas
    const rows = Array.isArray(parsed) ? parsed : parsed.rows;
    if (!Array.isArray(rows)) continue;

    let changed = false;
    rows.forEach((row, idx) => {
      if (row && row.Result !== undefined) {
        const t = typeof row.Result;
        if (t === "number") {
          // Convierte a string
          row.Result = String(row.Result);
          changed = true;
          console.log(`[${file}] Fila ${idx} campo Result convertido a string.`);
        } else if (t !== "string") {
          console.log(
            `[${file}] Fila ${idx} campo Result NO es número/string:`,
            row.Result
          );
        }
      }
    });

    // Si hubo cambios, guarda el archivo corregido
    if (changed) {
      if (Array.isArray(parsed)) {
        fs.writeFileSync(filePath, JSON.stringify(rows, null, 2), "utf8");
      } else {
        parsed.rows = rows;
        fs.writeFileSync(filePath, JSON.stringify(parsed, null, 2), "utf8");
      }
      console.log(`[${file}] Archivo corregido y guardado.`);
    }
  }
}

// Cambia esta ruta por la de tu directorio de tablas
const dirPath ="/var/lib/rm/data/Data/systems/rmss/module/combat/tables/arms";

checkAndFixResultFields(dirPath);