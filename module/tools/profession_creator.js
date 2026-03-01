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

const DEFAULT_IMG = "systems/rmss/assets/default/bonus.svg";

/**
 * Creates a profession item and adds it to the Items directory.
 * @param {string} professionKey - Key from PROFESSION_COSTS (e.g. "Cleric").
 * @param {Object} [options] - { openSheet: boolean }
 * @returns {Promise<Item|null>} Created item or null if unknown profession.
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

  const itemData = {
    name: professionKey,
    type: "profession",
    img: def.img ?? DEFAULT_IMG,
    system: {
      description: "",
      spellUserType: def.spellUserType ?? "none",
      spellRealm: def.spellRealm ?? "",
      spellRealm2: def.spellRealm2 ?? "",
      primeStats: ["", "", "", ""],
      skillCategoryCosts: costs,
      professionBonuses: [],
      skillDesignations: [],
      basicSpellLists: [],
      spells: { lists: [] },
      training_packages: []
    }
  };

  const item = await Item.create(itemData, { temporary: false });
  ui.notifications.info(`Profesión "${item.name}" creada.`);

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
