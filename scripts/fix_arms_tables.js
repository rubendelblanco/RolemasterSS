const fs = require("fs");
const path = require("path");


async function wrapJsonArraysInDir(dir) {
  const files = await fs.promises.readdir(dir);
  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    const filePath = path.join(dir, file);
    const content = await fs.promises.readFile(filePath, "utf8");
    let parsed;
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      console.warn(`No se pudo parsear ${file}:`, e);
      continue;
    }
    if (Array.isArray(parsed)) {
      const wrapped = { rows: parsed };
      await fs.promises.writeFile(filePath, JSON.stringify(wrapped, null, 2), "utf8");
      console.log(`Archivo ${file} envuelto en { rows: [...] }`);
    }
  }
}

// Cambia esta ruta por la de tu directorio de tablas
const dirPath = "/var/lib/rm/data/Data/systems/rmss/module/combat/tables/arms";

wrapJsonArraysInDir(dirPath)
  .then(() => console.log("Proceso completado."))
  .catch(err => console.error("Error:", err));