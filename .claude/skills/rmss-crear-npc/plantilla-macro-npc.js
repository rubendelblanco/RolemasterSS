// PLANTILLA de macro de script de Foundry para crear un NPC de RMSS completo.
// Sustituir SOLO los bloques de datos (NAME, SKILLS, LISTS, ITEMS, DESCRIPTION y los valores de Actor.create).
// Con DRY_RUN = true solo comprueba qué encuentra en el mundo y manda un informe privado por chat; luego false.
const DRY_RUN = true;

const norm = (s) => String(s ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().trim();
const findWorld = (type, names) => {
  const wanted = names.map(norm);
  return game.items.find((i) => i.type === type && wanted.includes(norm(i.name)));
};

const NAME = "Nombre del NPC";

// bonus = bonus TOTAL de la habilidad (se escribe tal cual en el NPC); ranks es solo informativo.
// slug = categoría que se usa SOLO si la habilidad no existe en el mundo (si existe, manda su categorySlug).
const SKILLS = [
  { names: ["Nombre en el idioma del mundo", "Alternativa", "English name"], slug: "outdoor-animal", ranks: 6, bonus: 50 }
];

// ranks = nivel de lista conocido; bonus = bonus de lanzamiento (la habilidad lleva el nombre de la lista).
// slug: spells-own-realm-own-base-lists | spells-own-realm-other-base-lists | spells-own-realm-open-lists | spells-own-realm-closed-lists ...
const LISTS = [
  { names: ["Nombre de la lista en el idioma del mundo"], slug: "spells-own-realm-own-base-lists", ranks: 5, bonus: 35 }
];

const ITEMS = [
  { name: "Objeto", weight: 1, description: "Descripción." }
];

const DESCRIPTION = `<h2>${NAME}</h2><p>...</p>`;

// ---------- Comprobaciones ----------
const skillPlan = SKILLS.map((s) => {
  const world = findWorld("skill", s.names);
  return { ...s, world, name: world?.name ?? s.names[0], slug: world?.system?.categorySlug || s.slug };
});
const listPlan = LISTS.map((l) => {
  const world = findWorld("spell_list", l.names);
  return { ...l, world, name: world?.name ?? l.names[0] };
});
const missingLists = listPlan.filter((l) => !l.world).map((l) => l.name);

const report = [
  "<b>Habilidades</b>: " + skillPlan.map((s) => `${s.world ? "✔" : "➕ (se crea, categoría supuesta " + s.slug + ")"} ${s.name}`).join("; "),
  "<b>Listas</b>: " + listPlan.map((l) => `${l.world ? "✔" : "✘ no está en el mundo"} ${l.name}`).join("; ")
];
const send = (extra = []) => ChatMessage.create({
  whisper: [game.user.id],
  content: `<h3>${NAME} — ${DRY_RUN ? "PRUEBA (no se ha creado nada)" : "creado"}</h3>`
    + [...report, ...extra].map((l) => `<p>${l}</p>`).join("")
});

if (DRY_RUN) { await send(); return ui.notifications.info("Prueba hecha: mira el informe en el chat."); }

// ---------- Creación ----------
const { expandSpellListEmbeddedSpells } = await import("/systems/rmss/module/spells/spell_list_import.js");
const clean = (data) => { delete data._id; delete data.folder; delete data.sort; delete data.ownership; return data; };
const skillSystem = (extra) => ({
  description: "", category: null, ranks: 0, new_ranks: { value: 0, max: 3, max_default: 3 },
  development_cost: "0", rank_bonus: 0, category_bonus: 0, item_bonus: 0,
  special_bonus_1: 0, special_bonus_2: 0, total_bonus: 0, favorite: false, designation: "None",
  offensive_skill: "none", ...extra
});

const actor = await Actor.create({
  name: NAME,
  type: "npc",
  system: {
    attributes: {
      level: { value: 1 },
      hits: { current: 30, max: 30 },
      power_points: { current: 0, max: 0 }
    },
    armor_info: { armor_type: 1, total_db: 0 },
    fixed_info: { race: "", profession: "", realm: "" },   // realm: essence | channeling | mentalism | ... o ""
    description: DESCRIPTION
  }
});

// Habilidades normales y habilidades de lista (mismo nombre que la lista), con el bonus final puesto
const skillDocs = [];
for (const s of skillPlan) {
  const data = s.world ? clean(s.world.toObject()) : { name: s.name, type: "skill", img: "systems/rmss/assets/default/skill.svg", system: {} };
  data.system = foundry.utils.mergeObject(skillSystem({}), data.system ?? {}, { inplace: false });
  Object.assign(data.system, { category: null, categorySlug: s.slug, ranks: s.ranks, rank_bonus: s.bonus, total_bonus: s.bonus });
  skillDocs.push(data);
}
for (const l of listPlan.filter((x) => x.world)) {
  skillDocs.push({
    name: l.name, type: "skill", img: l.world.img ?? "systems/rmss/assets/default/skill.svg",
    system: skillSystem({ categorySlug: l.slug, ranks: l.ranks, rank_bonus: l.bonus, total_bonus: l.bonus,
      description: l.world.system?.description ?? "" })
  });
}
await actor.createEmbeddedDocuments("Item", skillDocs);

// Listas de hechizos, con sus hechizos
for (const l of listPlan.filter((x) => x.world)) {
  const [list] = await actor.createEmbeddedDocuments("Item", [clean(l.world.toObject())]);
  await expandSpellListEmbeddedSpells(actor, list);
}

// Objetos
await actor.createEmbeddedDocuments("Item", ITEMS.map((i) => ({
  name: i.name, type: "item", system: { quantity: 1, weight: i.weight, description: i.description }
})));

await send([...(missingLists.length ? ["<b>Listas que faltan en el mundo</b>: " + missingLists.join("; ")] : [])]);
actor.sheet.render(true);
