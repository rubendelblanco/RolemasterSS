// Comprobación de los fixtures de listas de hechizos (fixtures/spell_lists).
// Uso, desde la raíz del repo:  node .claude/skills/rmss-transcribir-lista-hechizos/comprobar-fixtures.js
// Errores (salida 1): JSON roto, tipo de hechizo inexistente, tipo de lista inexistente, nivel no numérico, ficheros
// sin su pareja en el otro idioma, o distinto número de hechizos / niveles / tipos entre en/ y es/.
// Avisos (no fallan): hechizos con tipo "E" a secas (E solo existe como BE o DE; ver SKILL.md).
import fs from "node:fs";
import path from "node:path";

const ROOT = path.join(process.cwd(), "fixtures", "spell_lists");
const SPELL_TYPES = new Set(["U", "F", "P", "I", "BE", "DE"]);
const LIST_TYPES = new Set(["open", "closed", "base"]);

const errors = [], warnings = [];
const files = { en: new Map(), es: new Map() };

function walk(dir, lang, base) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, lang, base);
    else if (entry.name.endsWith(".json")) files[lang].set(path.relative(base, full).replace(/\\/g, "/"), full);
  }
}
for (const lang of ["en", "es"]) {
  const base = path.join(ROOT, lang);
  if (!fs.existsSync(base)) { errors.push(`Falta la carpeta ${lang}/`); continue; }
  walk(base, lang, base);
}

const parsed = { en: new Map(), es: new Map() };
for (const lang of ["en", "es"]) {
  for (const [rel, full] of files[lang]) {
    let json;
    try { json = JSON.parse(fs.readFileSync(full, "utf8")); } catch (e) { errors.push(`${lang}/${rel}: JSON no válido (${e.message})`); continue; }
    parsed[lang].set(rel, json);
    if (!LIST_TYPES.has(json.system?.type)) errors.push(`${lang}/${rel}: tipo de lista "${json.system?.type}" (debe ser open, closed o base)`);
    for (const s of json.system?.spells ?? []) {
      const t = s.system?.type;
      if (t === "E") warnings.push(`${lang}/${rel}: "${s.name}" es de tipo E a secas (¿DE, BE o F?)`);
      else if (!SPELL_TYPES.has(t)) errors.push(`${lang}/${rel}: "${s.name}" tiene el tipo inexistente "${t}"`);
      if (!Number.isFinite(Number(s.system?.level))) errors.push(`${lang}/${rel}: "${s.name}" no tiene un nivel numérico`);
    }
  }
}

for (const rel of files.en.keys()) if (!files.es.has(rel)) errors.push(`es/${rel}: falta la pareja en español`);
for (const rel of files.es.keys()) if (!files.en.has(rel)) errors.push(`en/${rel}: falta la pareja en inglés`);

for (const [rel, en] of parsed.en) {
  const es = parsed.es.get(rel);
  if (!es) continue;
  const a = en.system?.spells ?? [], b = es.system?.spells ?? [];
  if (a.length !== b.length) { errors.push(`${rel}: ${a.length} hechizos en inglés y ${b.length} en español`); continue; }
  a.forEach((s, i) => {
    const t = b[i];
    if (s.system?.type !== t.system?.type) errors.push(`${rel}: hechizo ${i + 1} ("${s.name}") es ${s.system?.type} en inglés y ${t.system?.type} en español`);
    if (Number(s.system?.level) !== Number(t.system?.level)) errors.push(`${rel}: hechizo ${i + 1} ("${s.name}") tiene nivel distinto entre idiomas`);
  });
}

const total = [...parsed.en.values()].reduce((n, j) => n + (j.system?.spells?.length ?? 0), 0);
console.log(`${parsed.en.size} listas por idioma, ${total} hechizos por idioma.`);
if (warnings.length) {
  const en = warnings.filter((w) => w.startsWith("en/"));
  console.log(`\nAvisos (${en.length} en inglés, mismos en español):\n` + en.join("\n"));
}
if (errors.length) { console.log(`\nERRORES (${errors.length}):\n` + errors.join("\n")); process.exit(1); }
console.log("\nSin errores.");
