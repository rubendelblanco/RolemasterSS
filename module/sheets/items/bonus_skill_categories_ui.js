/**
 * Bonus to a whole skill category (as opposed to bonus_skills, which targets one named skill).
 * A simple add/remove list, not drag-and-drop like bonus_skills - the target is a slug picked
 * from the fixed CONFIG.rmss.skill_categories set rather than a specific embedded skill item,
 * so there's nothing to drag: any category exists whether or not the wearer already has it.
 */

/**
 * @param {unknown} raw
 * @returns {{ category: string, bonus: number }[]}
 */
export function normalizeBonusSkillCategories(raw) {
  const arr = Array.isArray(raw) ? raw : (raw && typeof raw === "object")
    ? Object.keys(raw).filter(k => /^\d+$/.test(k)).sort((a, b) => Number(a) - Number(b)).map(k => raw[k])
    : [];
  return arr.map((e) => ({
    category: e?.category ?? "",
    bonus: Number(e?.bonus) || 0
  }));
}

/**
 * @param {object} system
 * @returns {Array<{ category: string, bonus: number, idx: number }>}
 */
export function buildBonusSkillCategoriesListForSheet(system) {
  return normalizeBonusSkillCategories(system?.bonus_skill_categories).map((e, idx) => ({ ...e, idx }));
}

/**
 * Dropdown options for the category select, sorted by label.
 * @returns {{ key: string, label: string }[]}
 */
export function getSkillCategoryOptionsForSheet() {
  const categories = CONFIG.rmss?.skill_categories ?? {};
  return Object.entries(categories)
    .map(([key, def]) => ({ key, label: def.name ?? key }))
    .sort((a, b) => a.label.localeCompare(b.label));
}

/**
 * Merge flattened form keys system.bonus_skill_categories.N.field into a real array.
 * @param {object} formData
 */
export function mergeBonusSkillCategoriesFormData(formData) {
  const prefix = "system.bonus_skill_categories.";
  const patchKeys = Object.keys(formData).filter((k) => k.startsWith(prefix) && k !== "system.bonus_skill_categories");
  if (patchKeys.length === 0) return;

  const list = [];
  for (const key of patchKeys) {
    const rest = key.slice(prefix.length);
    const dotPos = rest.indexOf(".");
    if (dotPos < 0) continue;
    const idx = parseInt(rest.slice(0, dotPos), 10);
    const field = rest.slice(dotPos + 1);
    if (!Number.isInteger(idx) || idx < 0) continue;
    let val = formData[key];
    if (field === "bonus") val = Number(val) || 0;
    else if (field === "category") val = String(val ?? "");
    list[idx] = { ...(list[idx] ?? { category: "", bonus: 0 }), [field]: val };
    delete formData[key];
  }

  formData["system.bonus_skill_categories"] = list.filter(Boolean);
}

/**
 * @param {ItemSheet} sheet
 * @param {jQuery} html
 */
export function bindBonusSkillCategoriesEditor(sheet, html) {
  if (!sheet.isEditable) return;

  html.find("[data-action='add-bonus-skill-category']").on("click", async (ev) => {
    ev.preventDefault();
    const list = normalizeBonusSkillCategories(sheet.item.system?.bonus_skill_categories ?? []);
    list.push({ category: "", bonus: 0 });
    await sheet.item.update({ "system.bonus_skill_categories": list });
    sheet.render(false);
  });

  html.find("[data-action='remove-bonus-skill-category']").on("click", async (ev) => {
    ev.preventDefault();
    const idx = parseInt(ev.currentTarget.dataset.index, 10);
    if (!Number.isInteger(idx) || idx < 0) return;
    const list = normalizeBonusSkillCategories(sheet.item.system?.bonus_skill_categories ?? []);
    list.splice(idx, 1);
    await sheet.item.update({ "system.bonus_skill_categories": list });
    sheet.render(false);
  });
}
