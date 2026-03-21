/**
 * Shared utilities for enchantment data in item sheets (weapon, armor, item).
 */

/**
 * Normalize enchantments: convert object-with-numeric-keys to array if corrupted.
 * @param {Array|Object} raw
 * @returns {Array}
 */
export function normalizeEnchantments(raw) {
  const arr = raw ?? [];
  return Array.isArray(arr)
    ? arr
    : Object.keys(arr)
        .filter((k) => /^\d+$/.test(k))
        .sort((a, b) => Number(a) - Number(b))
        .map((k) => arr[k]);
}

/**
 * Build enchantmentList for sheet template (labels, usage, canUse, etc.).
 * @param {Array} rawEnchantments
 * @returns {Array}
 */
export function buildEnchantmentList(rawEnchantments) {
  const enchantments = normalizeEnchantments(rawEnchantments);
  return enchantments.map((e) => {
    const realm = e.realm ?? "";
    const listType = e.listType ?? "";
    const profession = e.profession ?? "";
    let listTypeLabel = "—";
    if (listType) {
      const isBase = ["base", "own_base", "other_base"].includes(listType);
      const label = isBase
        ? (CONFIG.rmss?.spell_list_type?.base || "Base")
        : (CONFIG.rmss?.spell_list_type?.[listType] || listType);
      listTypeLabel = isBase && profession ? `${label} (${profession})` : label;
    }
    const spellLinkUuid = e.spellUuid || e.spellListUuid || "";
    const usage = e.usage ?? "passive";
    const usesPerDay = Number(e.usesPerDay) || 0;
    const usesRemaining = Number(e.usesRemaining) ?? usesPerDay;
    const chargesMax = Number(e.chargesMax) || 0;
    const charges = Number(e.charges) ?? chargesMax;
    const canUse =
      usage !== "passive" &&
      ((usage === "daily" && usesRemaining > 0) ||
        (usage === "charged" && charges > 0) ||
        (usage === "single" && (charges > 0 || usesRemaining > 0)));
    const usageLabels = {
      passive: () => game.i18n.localize("rmss.item.enchantment_usage_passive") || "Passive",
      daily: () => `${usesRemaining}/${usesPerDay}`,
      charged: () => `${charges}/${chargesMax}`,
      single: () => (charges > 0 ? `${charges}/1` : usesRemaining > 0 ? `${usesRemaining}/1` : "0/1")
    };
    const usageLabel = usageLabels[usage]?.() ?? "—";
    return {
      ...e,
      spell: e.spell ?? "",
      level: e.level ?? "",
      realmLabel: realm ? (CONFIG.rmss?.spell_realm?.[realm] || realm) : "—",
      listTypeLabel,
      spellListName: e.spellListName ?? "—",
      spellLinkUuid,
      usage,
      usesPerDay,
      usesRemaining,
      chargesMax,
      charges,
      canUse,
      usageLabel
    };
  });
}

/**
 * @param {Object} system - item.system
 * @returns {string} "" | "multiplier" | "spell_adder"
 */
export function getPowerModifierMode(system) {
  const ppMult = Number(system?.pp_multiplier) || 1;
  const spellAdd = Number(system?.spell_adder) || 0;
  return ppMult >= 2 ? "multiplier" : spellAdd > 0 ? "spell_adder" : "";
}

/**
 * Resolve profession display name from uuid or name.
 * @param {string} uuidOrName
 * @returns {Promise<string>}
 */
export async function resolveProfessionName(uuidOrName) {
  if (!uuidOrName) return "";
  if (!uuidOrName.startsWith("Actor.") && !uuidOrName.startsWith("Compendium.")) {
    return uuidOrName; // already a name
  }
  try {
    const doc = await fromUuid(uuidOrName);
    return doc?.name ?? uuidOrName;
  } catch {
    return uuidOrName;
  }
}

/**
 * Setup profession drop zones for Power Modifier (when realm = profession).
 * @param {JQuery} html
 * @param {ItemSheet} sheet
 */
export function setupPowerModifierProfessionDropZones(html, sheet) {
  html.find(".rmss-power-modifier-profession-drop").each((_, el) => {
    el.addEventListener("dragover", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = "copy";
    });
    el.addEventListener("drop", ev => onDropPowerModifierProfession(ev, sheet));
  });
}

/**
 * Handle drop of profession on Power Modifier zone.
 * @param {DragEvent} event
 * @param {ItemSheet} sheet
 */
export async function onDropPowerModifierProfession(event, sheet) {
  event.preventDefault();
  event.stopPropagation();
  let data;
  try {
    data = JSON.parse(event.dataTransfer.getData("text/plain"));
  } catch {
    return;
  }
  if (!data?.uuid) return;
  const dropped = await fromUuid(data.uuid);
  if (!dropped || dropped.type !== "profession") {
    ui.notifications.warn(game.i18n.localize("rmss.item.drop_profession_only"));
    return;
  }
  const zone = event.currentTarget;
  const field = zone.dataset?.powerModifier;
  if (field !== "pp_multiplier" && field !== "spell_adder") return;
  const updatePath = field === "pp_multiplier"
    ? "system.pp_multiplier_profession"
    : "system.spell_adder_profession";
  await sheet.item.update({ [updatePath]: dropped.uuid });
  sheet.render(false);
}

/**
 * Handle clear button for Power Modifier profession.
 * @param {Event} event
 * @param {ItemSheet} sheet
 */
export async function onClearPowerModifierProfession(event, sheet) {
  event.preventDefault();
  const field = event.currentTarget.dataset?.powerModifier;
  if (field !== "pp_multiplier" && field !== "spell_adder") return;
  const updatePath = field === "pp_multiplier"
    ? "system.pp_multiplier_profession"
    : "system.spell_adder_profession";
  await sheet.item.update({ [updatePath]: "" });
  sheet.render(false);
}
