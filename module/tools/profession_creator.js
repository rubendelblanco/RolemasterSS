/**
 * Creates profession items from predefined data. Used by macros.
 * @example
 *   await game.rmss.createProfession("Cleric");
 *   // or with dialog:
 *   await game.rmss.createProfessionDialog();
 */
import {
  getProfessionCosts,
  getAvailableProfessions,
  PROFESSION_DEFINITIONS
} from "./profession_txt_parser.js";
import { buildProfessionSystem, formatProfessionReport } from "./profession_builder.js";

const DEFAULT_IMG = "systems/rmss/assets/default/bonus.svg";

/**
 * Creates a profession item in the world, or updates the one that already has that name.
 * Besides the cost table it fills in what the definition carries: prime stats, bonuses, skill designations, the base
 * spell lists and the description. Skills and spell lists are found in the world's catalog by name; the ones that are
 * not there are left out and reported (nothing is invented).
 * @param {string} professionKey - Key from PROFESSION_COSTS (e.g. "Paladin").
 * @param {Object} [options]
 * @param {boolean} [options.openSheet=true]
 * @param {boolean} [options.update=false] - If a profession with that name exists, update it instead of creating another.
 * @param {boolean} [options.dryRun=false] - Create/change nothing: whisper what would be linked and what is missing.
 * @returns {Promise<Item|null>} The created or updated item, or null (unknown profession, or dry run).
 */
export async function createProfession(professionKey, options = {}) {
  const costs = getProfessionCosts(professionKey);
  if (!costs) {
    ui.notifications.warn(`Profesión desconocida: "${professionKey}"`);
    return null;
  }

  const def = PROFESSION_DEFINITIONS[professionKey] ?? {
    spellUserType: "none",
    spellRealm: "",
    spellRealm2: "",
    img: DEFAULT_IMG
  };

  const catalog = {
    skills: game.items.filter((i) => i.type === "skill").map((i) => ({ name: i.name, system: { slug: i.system?.slug } })),
    spellLists: game.items.filter((i) => i.type === "spell_list").map((i) => ({ name: i.name, uuid: i.uuid }))
  };
  const { system, report } = buildProfessionSystem(def, costs, catalog);
  const existing = game.items.find((i) => i.type === "profession" && i.name === professionKey);
  const lines = formatProfessionReport(report);

  if (options.dryRun) {
    const head = existing
      ? `Ya existe «${professionKey}». Con update: true se actualizaría; sin él se crearía otra.`
      : `«${professionKey}» no existe: se crearía.`;
    await ChatMessage.create({
      content: `<p><strong>Prueba de «${professionKey}»</strong></p><p>${head}</p><p>${lines.join("<br>") || "Sin habilidades ni listas que enlazar."}</p>`,
      whisper: [game.user.id]
    });
    return null;
  }

  let item;
  if (existing && options.update) {
    // Only what the definition owns is touched; anything else the profession has (training packages, notes) stays
    await existing.update({
      "system.spellUserType": system.spellUserType,
      "system.spellRealm": system.spellRealm,
      "system.spellRealm2": system.spellRealm2,
      "system.primeStats": system.primeStats,
      "system.skillCategoryCosts": system.skillCategoryCosts,
      "system.professionBonuses": system.professionBonuses,
      "system.skillDesignations": system.skillDesignations,
      "system.basicSpellLists": system.basicSpellLists,
      ...(existing.system?.description ? {} : { "system.description": system.description })
    });
    item = existing;
    ui.notifications.info(`Profesión "${item.name}" actualizada.`);
  } else {
    item = await Item.create({
      name: professionKey,
      type: "profession",
      img: def.img ?? DEFAULT_IMG,
      system
    }, { temporary: false });
    ui.notifications.info(`Profesión "${item.name}" creada.`);
  }

  const missing = lines.filter((l) => l.startsWith("✘"));
  if (missing.length) {
    ui.notifications.warn(`${missing.length} cosa(s) no están en el catálogo y no se enlazaron. Mira la consola.`);
    console.warn("RMSS | Profesión " + professionKey + ": " + missing.join(" | "));
  }

  if (options.openSheet !== false) {
    item.sheet.render(true);
  }

  return item;
}

/**
 * Shows a dialog to select a profession, then creates it.
 * @returns {Promise<Item|null>}
 */
export async function createProfessionDialog() {
  const professions = getAvailableProfessions();
  if (professions.length === 0) {
    ui.notifications.warn("No hay profesiones definidas.");
    return null;
  }

  const options = professions.map(p => `<option value="${p}">${p}</option>`).join("");

  return new Promise((resolve) => {
    new Dialog({
      title: "Crear profesión",
      content: `
        <form>
          <div class="form-group">
            <label>Profesión</label>
            <select name="profession">${options}</select>
          </div>
        </form>
      `,
      buttons: {
        create: {
          icon: "<i class='fas fa-check'></i>",
          label: "Crear",
          callback: async (html) => {
            const key = html.find("[name=profession]").val();
            const item = await createProfession(key);
            resolve(item);
          }
        },
        cancel: {
          icon: "<i class='fas fa-times'></i>",
          label: "Cancelar",
          callback: () => resolve(null)
        }
      },
      default: "create"
    }).render(true);
  });
}
