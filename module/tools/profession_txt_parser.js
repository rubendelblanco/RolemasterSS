/**
 * Parser for profession development costs from external TXT files.
 * Maps Spanish category names (format: "Category·Subcategory" or "Category") to RMSS slugs.
 *
 * TXT format: one line per category, "Name\tCost" (tab-separated).
 * Cost can be: "2/2/2", "10", "1/4", "3/7", etc.
 *
 * Usage (Node or browser):
 *   const { parseProfessionTxt, SPANISH_TO_SLUG } = require("./profession_txt_parser.js");
 *   const costs = parseProfessionTxt(txtContent);
 */

/** Spanish name (as in TXT) -> RMSS skill category slug. */
export const SPANISH_TO_SLUG = {
  "Armadura·Ligera": "armor-light",
  "Armadura·Media": "armor-medium",
  "Armadura·Pesada": "armor-heavy",
  "Armas·Categoría1": "weapon-1-h-edged",
  "Armas·Categoría2": "weapon-1-h-concussion",
  "Armas·Categoría3": "weapon-2-handed",
  "Armas·Categoría4": "weapon-missile",
  "Armas·Categoría5": "weapon-pole-arms",
  "Armas·Categoría6": "weapon-missile-artillery",
  "Armas·Categoría7": "weapon-thrown",
  "Arte·Activo": "artistic-active",
  "Arte·Pasivo": "artistic-passive",
  "Artes Marciales·Golpes": "martial-arts-striking",
  "Artes Marciales·Barridos": "martial-arts-sweeps",
  "Artes Marciales·Maniobras de Combate": "martial-arts-combat-maneuvers",
  "Ataques Especiales": "special-attacks",
  "Atletismo·Gimnasia": "athletic-gymnastics",
  "Atletismo·Potencia": "athletic-brawn",
  "Atletismo·Resistencia": "athletic-endurance",
  "Autocontrol": "self-control",
  "Ciencia/Analítica·Básica": "scienceanalytic-basic",
  "Ciencia/Analítica·Especializada": "scienceanalytic-specialized",
  "Comunicación": "communications",
  "Comunicaciones": "communications",
  "Conocimiento·General": "lore-general",
  "Conocimiento·Mágico": "lore-magical",
  "Conocimiento·Oscuro": "lore-obscure",
  "Conocimiento·Técnico": "lore-technical",
  "Defensas Especiales": "special-defenses",
  "Desarrollo de Puntos de Poder": "power-point-development",
  "Desarrollo Físico": "body-development",
  "Exteriores·Animales": "outdoor-animal",
  "Exterior·Animales": "outdoor-animal",
  "Exteriores·Entorno": "outdoor-environmental",
  "Exteriores·Medio Ambiente": "outdoor-environmental",
  "Hechizos Dirigidos": "directed-spells",
  "Influencia": "influence",
  "Maniobras de Combate": "combat-maneuvers",
  "Manipulación del Poder": "power-manipulation",
  "Manipulación de Poder": "power-manipulation",
  "Oficios": "crafts",
  "Percepción·Búsqueda": "awareness-searching",
  "Percepción·Perspicacia": "awareness-perceptions",
  "Percepción·Sentidos": "awareness-senses",
  "Percepción de Poder": "power-awareness",
  "Subterfugio·Ataque": "subterfuge-attack",
  "Subterfugio·Mecánica": "subterfuge-mechanics",
  "Subterfugio·Sigilo": "subterfuge-stealth",
  "Técnica/Comercio·General": "technicaltrade-general",
  "Técnica/Comercio·Profesional": "technicaltrade-professional",
  "Técnica/Comercio·Vocacional": "technicaltrade-vocational",
  "Urbana": "urban",
  "Urbano": "urban",
};

/**
 * Parses TXT content and returns skillCategoryCosts object for a profession.
 * @param {string} txt - Raw TXT content (lines: "Name\tCost").
 * @returns {{ costs: Object, unmapped: string[] }} costs keyed by slug, unmapped lines.
 */
export function parseProfessionTxt(txt) {
  const costs = {};
  const unmapped = [];

  const lines = txt.trim().split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) continue;

    const sep = trimmed.includes("\t") ? "\t" : "  "; // tab or double space
    const parts = trimmed.split(sep).map((p) => p.trim());
    const name = parts[0];
    const cost = parts[1] ?? "";

    if (!name) continue;

    const slug = SPANISH_TO_SLUG[name];
    if (slug) {
      costs[slug] = cost;
    } else {
      unmapped.push(`${name} -> ${cost}`);
    }
  }

  return { costs, unmapped };
}

/** Profession name -> TXT content with development costs (tab-separated). */
export const PROFESSION_COSTS = {
  Cleric: `Armadura·Ligera	2/2/2
Armadura·Media	10
Armadura·Pesada	11
Armas·Categoría1	6
Armas·Categoría2	7
Armas·Categoría3	9
Armas·Categoría4	9
Armas·Categoría5	9
Armas·Categoría6	20
Armas·Categoría7	2
Arte·Activo	2/5
Arte·Pasivo	2/5
Artes Marciales·Golpes	6
Artes Marciales·Barridos	6
Artes Marciales·Maniobras de Combate	12
Ataques Especiales	10
Atletismo·Gimnasia	3
Atletismo·Potencia	6
Atletismo·Resistencia	3
Autocontrol	5
Ciencia/Analítica·Básica	1/4
Ciencia/Analítica·Especializada	6/14
Comunicación	2/2/2
Conocimiento·General	1/3
Conocimiento·Mágico	2/4
Conocimiento·Oscuro	3/7
Conocimiento·Técnico	2/6
Defensas Especiales	30
Desarrollo de Puntos de Poder	4
Desarrollo Físico	10
Exteriores·Animales	3
Exteriores·Entorno	2/7
Hechizos Dirigidos	3
Influencia	2/4
Maniobras de Combate	10
Manipulación del Poder	4/10
Oficios	4/10
Percepción·Búsqueda	2/6
Percepción·Perspicacia	6
Percepción·Sentidos	3/7
Percepción de Poder	2/5
Subterfugio·Ataque	15
Subterfugio·Mecánica	7
Subterfugio·Sigilo	5
Técnica/Comercio·General	3/7
Técnica/Comercio·Profesional	8
Técnica/Comercio·Vocacional	5/12
Urbana	3`,
  Mystic: `Armadura·Ligera	4/4/4
Armadura·Media	6/6/6
Armadura·Pesada	7/7/7
Armas·Categoría1	9
Armas·Categoría2	20
Armas·Categoría3	20
Armas·Categoría4	20
Armas·Categoría5	20
Armas·Categoría6	20
Armas·Categoría7	20
Arte·Activo	1/4
Arte·Pasivo	2/5
Artes Marciales·Golpes	6
Artes Marciales·Barridos	6
Artes Marciales·Maniobras de Combate	12
Ataques Especiales	15
Atletismo·Gimnasia	3
Atletismo·Potencia	7
Atletismo·Resistencia	3
Autocontrol	5
Ciencia/Analítica·Básica	1/4
Ciencia/Analítica·Especializada	6/14
Comunicación	1/1/1
Conocimiento·General	1/3
Conocimiento·Mágico	2/5
Conocimiento·Oscuro	3/7
Conocimiento·Técnico	2/6
Defensas Especiales	25
Desarrollo de Puntos de Poder	6
Desarrollo Físico	15
Exteriores·Animales	3
Exteriores·Entorno	3
Hechizos Dirigidos	2/6
Influencia	1/4
Maniobras de Combate	18
Manipulación del Poder	4/10
Oficios	4/10
Percepción·Búsqueda	2/4
Percepción·Perspicacia	3
Percepción·Sentidos	2/6
Percepción de Poder	2/5
Subterfugio·Ataque	15
Subterfugio·Mecánica	7
Subterfugio·Sigilo	2/7
Técnica/Comercio·General	3/7
Técnica/Comercio·Profesional	8
Técnica/Comercio·Vocacional	5/12
Urbana	2/5`,
  Animist: `Armadura·Ligera	2/2/2
Armadura·Media	10
Armadura·Pesada	11
Armas·Categoría1	6
Armas·Categoría2	7
Armas·Categoría3	9
Armas·Categoría4	9
Armas·Categoría5	9
Armas·Categoría6	20
Armas·Categoría7	20
Arte·Activo	2/5
Arte·Pasivo	2/5
Artes Marciales·Golpes	6
Artes Marciales·Barridos	6
Artes Marciales·Maniobras de Combate	12
Ataques Especiales	10
Atletismo·Gimnasia	3
Atletismo·Potencia	4
Atletismo·Resistencia	3
Autocontrol	5
Ciencia/Analítica·Básica	1/4
Ciencia/Analítica·Especializada	6/14
Comunicación	2/2/2
Conocimiento·General	1/3
Conocimiento·Mágico	2/5
Conocimiento·Oscuro	3/7
Conocimiento·Técnico	2/6
Defensas Especiales	40
Desarrollo de Puntos de Poder	4
Desarrollo Físico	8
Exteriores·Animales	1/2
Exteriores·Entorno	1/2
Hechizos Dirigidos	3
Influencia	2/6
Maniobras de Combate	10
Manipulación del Poder	4/10
Oficios	4/10
Percepción·Búsqueda	1/5
Percepción·Perspicacia	6
Percepción·Sentidos	3/7
Percepción de Poder	2/6
Subterfugio·Ataque	10
Subterfugio·Mecánica	8
Subterfugio·Sigilo	3
Técnica/Comercio·General	3/7
Técnica/Comercio·Profesional	8
Técnica/Comercio·Vocacional	5/12
Urbana	4`,
  Paladin: `Armadura·Ligera	1/1/1
Armadura·Media	2/2/2
Armadura·Pesada	3/3/3
Armas·Categoría1	2/5
Armas·Categoría2	3/8
Armas·Categoría3	4
Armas·Categoría4	4
Armas·Categoría5	4
Armas·Categoría6	6
Armas·Categoría7	6
Arte·Activo	2/5
Arte·Pasivo	2/5
Artes Marciales·Golpes	6
Artes Marciales·Barridos	6
Artes Marciales·Maniobras de Combate	12
Ataques Especiales	2/8
Atletismo·Gimnasia	3/7
Atletismo·Potencia	3/7
Atletismo·Resistencia	2/7
Autocontrol	2/7
Ciencia/Analítica·Básica	2/5
Ciencia/Analítica·Especializada	8
Comunicación	3/3/3
Conocimiento·General	1/3
Conocimiento·Mágico	3/6
Conocimiento·Oscuro	3/7
Conocimiento·Técnico	2/6
Defensas Especiales	30
Desarrollo de Puntos de Poder	8
Desarrollo Físico	4/10
Exteriores·Animales	2/6
Exteriores·Entorno	2/6
Hechizos Dirigidos	20
Influencia	1/5
Maniobras de Combate	4/10
Manipulación del Poder	6/12
Oficios	4/10
Percepción·Búsqueda	2/6
Percepción·Perspicacia	5/14
Percepción·Sentidos	3/7
Percepción de Poder	6
Subterfugio·Ataque	15
Subterfugio·Mecánica	7
Subterfugio·Sigilo	5
Técnica/Comercio·General	3/7
Técnica/Comercio·Profesional	8
Técnica/Comercio·Vocacional	5/12
Urbana	4`,
  Monk: `Armadura·Ligera	9
Armadura·Media	10
Armadura·Pesada	11
Armas·Categoría1	5
Armas·Categoría2	8
Armas·Categoría3	8
Armas·Categoría4	8
Armas·Categoría5	15
Armas·Categoría6	15
Armas·Categoría7	15
Arte·Activo	2/5
Arte·Pasivo	2/5
Artes Marciales·Golpes	2/5
Artes Marciales·Barridos	2/5
Artes Marciales·Maniobras de Combate	4/9
Ataques Especiales	5
Atletismo·Gimnasia	1/5
Atletismo·Potencia	3/7
Atletismo·Resistencia	2/7
Autocontrol	2/4
Ciencia/Analítica·Básica	2/5
Ciencia/Analítica·Especializada	8
Comunicación	3/3/3
Conocimiento·General	1/3
Conocimiento·Mágico	3/6
Conocimiento·Oscuro	3/7
Conocimiento·Técnico	2/6
Defensas Especiales	10
Desarrollo de Puntos de Poder	8
Desarrollo Físico	6/14
Exteriores·Animales	2/7
Exteriores·Entorno	2/6
Hechizos Dirigidos	9
Influencia	2/6
Maniobras de Combate	5/12
Manipulación del Poder	6/12
Oficios	4/10
Percepción·Búsqueda	2/6
Percepción·Perspicacia	4/14
Percepción·Sentidos	3/7
Percepción de Poder	3/7
Subterfugio·Ataque	8
Subterfugio·Mecánica	4
Subterfugio·Sigilo	2/7
Técnica/Comercio·General	3/7
Técnica/Comercio·Profesional	8
Técnica/Comercio·Vocacional	5/12
Urbana	3`
};

/** Profession metadata: spellUserType, spellRealm, spellRealm2, img. */
export const PROFESSION_DEFINITIONS = {
  Cleric: {
    spellUserType: "pure",
    spellRealm: "channeling",
    spellRealm2: "",
    img: "systems/rmss/assets/default/bonus.svg"
  },
  Mystic: {
    spellUserType: "hybrid",
    spellRealm: "essence",
    spellRealm2: "mentalism",
    img: "systems/rmss/assets/default/bonus.svg"
  },
  Animist: {
    spellUserType: "pure",
    spellRealm: "channeling",
    spellRealm2: "",
    img: "systems/rmss/assets/default/bonus.svg"
  },
  Paladin: {
    spellUserType: "pure",
    spellRealm: "channeling",
    spellRealm2: "",
    img: "systems/rmss/assets/default/bonus.svg"
  },
  Monk: {
    spellUserType: "none",
    spellRealm: "",
    spellRealm2: "",
    img: "systems/rmss/assets/default/bonus.svg"
  }
};

/**
 * Computes spell category costs from T-2.4 table based on spellUserType.
 * Returns only the first tier cost (e.g. "3/3/3"); the rest is computed at runtime.
 * Used for pure, semi, hybrid, arcane_pure, arcane_semi. Returns {} for "none".
 * @param {string} spellUserType - pure, semi, hybrid, arcane_pure, arcane_semi, or none
 * @param {Object} [config] - CONFIG.rmss (uses global if not provided, for Foundry)
 * @returns {Object} costs keyed by spell category slug
 */
export function getSpellCategoryCosts(spellUserType, config) {
  const cfg = config ?? globalThis.CONFIG?.rmss;
  const costsTable = cfg?.spell_list_dp_costs;
  const slugToTable = cfg?.spell_list_slug_to_table;
  if (!costsTable || !slugToTable) return {};

  const spellcasterTypes = ["pure", "semi", "hybrid", "arcane_pure", "arcane_semi"];
  if (!spellcasterTypes.includes(spellUserType)) return {};

  const result = {};
  for (const [slug, mapping] of Object.entries(slugToTable)) {
    const { realm, listType } = mapping;
    const realmTable = costsTable[realm]?.[listType];
    if (!realmTable) continue;

    let tierData = realmTable["1-5"] ?? realmTable["1+"];
    let raw = tierData?.[spellUserType];
    if (raw === undefined && realmTable["1+"]) {
      raw = realmTable["1+"][spellUserType];
    }
    if (raw === undefined || raw === null) continue;

    result[slug] = String(raw);
  }
  return result;
}

/**
 * Returns skillCategoryCosts for a profession by key.
 * Includes spell category costs (from T-2.4) when spellUserType is not "none".
 * @param {string} professionKey - Key from PROFESSION_COSTS (e.g. "Cleric").
 * @returns {Object|null} costs keyed by slug, or null if unknown.
 */
export function getProfessionCosts(professionKey) {
  const txt = PROFESSION_COSTS[professionKey];
  if (!txt) return null;
  const { costs, unmapped } = parseProfessionTxt(txt);
  if (unmapped.length > 0) {
    console.warn(`[RMSS] Profession "${professionKey}" - unmapped lines:`, unmapped);
  }
  const def = PROFESSION_DEFINITIONS[professionKey];
  const spellUserType = def?.spellUserType ?? "none";
  const spellCosts = getSpellCategoryCosts(spellUserType);
  return { ...costs, ...spellCosts };
}

/** @returns {string[]} Keys of available professions. */
export function getAvailableProfessions() {
  return Object.keys(PROFESSION_COSTS);
}

/** @deprecated Use getProfessionCosts("Cleric") */
export function getClericCosts() {
  return getProfessionCosts("Cleric");
}
