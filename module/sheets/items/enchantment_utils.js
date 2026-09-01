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
 * Item-level shared charge pool (e.g. an artifact's "40 charges/week" shared by several
 * "pooled"-usage enchantments at different costs each). Normalizes missing/malformed data.
 * @param {object} system - item.system
 * @returns {{current: number, max: number}}
 */
export function getChargePool(system) {
  const pool = system?.magic?.chargePool ?? {};
  const max = Math.max(0, Number(pool.max) || 0);
  const current = Math.min(max, Math.max(0, Number(pool.current) || 0));
  return { current, max };
}

/**
 * Advance an artifact's periodic pool recharge by one long rest (this system has no
 * calendar/day tracking, so a long rest is the only "time passes" signal it has).
 * `rechargeDays <= 0` means no periodic recharge is configured for this item — most items,
 * including ones with a pool but no set schedule — so nothing changes (null).
 * @param {object} magic - item.system.magic
 * @returns {{current: number, daysUntilRecharge: number}|null} New chargePool.current and
 *   daysUntilRecharge to write, or null if this item has no periodic recharge configured.
 */
export function advanceArtifactRecharge(magic) {
  const rechargeDays = Math.max(0, Number(magic?.rechargeDays) || 0);
  if (rechargeDays <= 0) return null;

  const max = Math.max(0, Number(magic?.chargePool?.max) || 0);
  const current = Math.min(max, Math.max(0, Number(magic?.chargePool?.current) || 0));
  const daysUntilRecharge = Math.max(0, Number(magic?.daysUntilRecharge) || 0);

  const remaining = daysUntilRecharge - 1;
  if (remaining <= 0) {
    return { current: max, daysUntilRecharge: rechargeDays };
  }
  return { current, daysUntilRecharge: remaining };
}

/**
 * Recharge countdown expressed as forward progress instead of a bare "days left" number,
 * so the sheet can drive a slider/progress bar that fills up as the artifact charges
 * (dragging right = closer to recharge), rather than a countdown that drains left.
 * @param {object} magic - item.system.magic
 * @returns {{rechargeDays: number, daysUntilRecharge: number, progress: number}} progress is
 *   0..rechargeDays, where rechargeDays itself means "recharges now".
 */
export function getRechargeProgress(magic) {
  const rechargeDays = Math.max(0, Number(magic?.rechargeDays) || 0);
  const daysUntilRecharge = Math.min(rechargeDays, Math.max(0, Number(magic?.daysUntilRecharge) || 0));
  const progress = rechargeDays > 0 ? rechargeDays - daysUntilRecharge : 0;
  return { rechargeDays, daysUntilRecharge, progress };
}

/**
 * Inverse of {@link getRechargeProgress}: turn a slider position back into daysUntilRecharge.
 * @param {number} rechargeDays
 * @param {number} progress - 0..rechargeDays
 * @returns {number} daysUntilRecharge to persist
 */
export function progressToDaysUntilRecharge(rechargeDays, progress) {
  const days = Math.max(0, Number(rechargeDays) || 0);
  const p = Math.min(days, Math.max(0, Number(progress) || 0));
  return days - p;
}

/**
 * @param {ItemSheet} sheet
 * @param {jQuery} html
 */
export function bindRechargeProgressEditor(sheet, html) {
  if (!sheet.isEditable) return;

  const ns = ".rmssRechargeProgressUi";
  const slider = html.find(".rmss-recharge-slider");
  if (!slider.length) return;

  const setFill = (el) => {
    const max = Number(el.max) || 0;
    const pct = max > 0 ? (Number(el.value) / max) * 100 : 0;
    el.style.setProperty("--rmss-recharge-fill", `${pct}%`);
  };
  slider.each((_, el) => setFill(el));

  slider.off(`input${ns}`).on(`input${ns}`, (ev) => setFill(ev.currentTarget));

  slider.off(`change${ns}`).on(`change${ns}`, async (ev) => {
    const el = ev.currentTarget;
    const rechargeDays = Number(el.max) || 0;
    const daysUntilRecharge = progressToDaysUntilRecharge(rechargeDays, el.value);
    await sheet.item.update({ "system.magic.daysUntilRecharge": daysUntilRecharge });
  });
}

/**
 * Pure: the power-modifier mini-form (mode select + one value + one realm, shape depends on
 * mode) reduced to a single system patch. No Foundry/DOM access, so it's directly
 * unit-testable. Called from each item-type sheet's _updateObject override with the raw
 * formData values for whichever fields the active mode rendered.
 * @param {"multiplier"|"spell_adder"|""} mode
 * @param {number|string} value - current multiplier or spell_adder value from the form (ignored if mode is "")
 * @param {string} realm - current realm select value for that mode
 * @param {number|string} remaining - current spell_adder_uses_remaining field value (mode "spell_adder" only)
 * @param {object} currentSystem - item.system as currently persisted, to detect an actual adder-value change
 * @returns {object} flat dotted-key patch for Item#update
 */
export function computePowerModifierPatch(mode, value, realm, remaining, currentSystem) {
  if (mode === "multiplier") {
    const mult = Number(value);
    return {
      "system.pp_multiplier": Number.isFinite(mult) && mult >= 2 ? mult : 2,
      "system.pp_multiplier_realm": realm || "",
      "system.spell_adder": 0,
      "system.spell_adder_realm": "",
      "system.spell_adder_uses_remaining": 0
    };
  }
  if (mode === "spell_adder") {
    const adderVal = Math.max(1, Number(value) || 1);
    const priorAdderVal = Number(currentSystem?.spell_adder) || 0;
    // A changed adder value is always a full recharge. Unchanged (only the realm moved, or
    // the remaining field itself was edited), keep what was typed there - just clamped so
    // it can never sit above the (unchanged) adder value.
    let remainingVal;
    if (adderVal !== priorAdderVal) {
      remainingVal = adderVal;
    } else {
      const typed = Number(remaining);
      const base = Number.isFinite(typed) ? typed : (Number(currentSystem?.spell_adder_uses_remaining) || 0);
      remainingVal = Math.min(Math.max(0, base), adderVal);
    }
    return {
      "system.spell_adder": adderVal,
      "system.spell_adder_realm": realm || "",
      "system.spell_adder_uses_remaining": remainingVal,
      "system.pp_multiplier": 1,
      "system.pp_multiplier_realm": ""
    };
  }
  return {
    "system.pp_multiplier": 1,
    "system.pp_multiplier_realm": "",
    "system.spell_adder": 0,
    "system.spell_adder_realm": "",
    "system.spell_adder_uses_remaining": 0
  };
}

/**
 * Build enchantmentList for sheet template (labels, usage, canUse, etc.).
 * @param {Array} rawEnchantments
 * @param {{current?: number, max?: number}} [chargePool] - Item-level shared pool for "pooled" usage
 *   entries (e.g. an artifact with N power points shared across several spells at different costs).
 * @returns {Array}
 */
export function buildEnchantmentList(rawEnchantments, chargePool = {}) {
  const poolCurrent = Number(chargePool?.current) || 0;
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
    const usesPerDay = Number(e.usesPerDay) || (usage === "daily" ? 1 : 0);
    const usesRemaining = Math.min(Number(e.usesRemaining) ?? usesPerDay, usesPerDay);
    const chargesMax = Number(e.chargesMax) || (usage === "charged" ? 10 : 0);
    const charges = Math.min(Number(e.charges) ?? chargesMax, chargesMax);
    const poolCost = Math.max(1, Number(e.poolCost) || 1);
    const canUse =
      usage !== "passive" &&
      ((usage === "daily" && usesRemaining > 0) ||
        (usage === "charged" && charges > 0) ||
        (usage === "pooled" && poolCurrent >= poolCost) ||
        usage === "single");
    const usageLabels = {
      passive: () => game.i18n.localize("rmss.item.enchantment_usage_passive") || "Passive",
      daily: () => `${usesRemaining}/${usesPerDay}`,
      charged: () => `${charges}/${chargesMax}`,
      pooled: () => `${poolCost} ${game.i18n.localize("rmss.item.enchantments_pool_cost_unit") || "pts"}`,
      single: () => game.i18n.localize("rmss.item.enchantment_usage_single") || "Single use"
    };
    const usageLabel = usageLabels[usage]?.() ?? "—";
    const attackBonus = Number(e.attackBonus) || 0;
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
      poolCost,
      attackBonus,
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
  try {
    const doc = await fromUuid(uuidOrName);
    if (doc?.name) return doc.name;
  } catch { /* not a valid UUID, treat as plain name */ }
  return uuidOrName;
}

/**
 * Setup profession drop zones for Power Modifier (when realm = profession).
 * Direct binding on each element, same pattern as bonus-skill drop zones.
 * @param {JQuery} html
 * @param {ItemSheet} sheet
 */
export function setupPowerModifierProfessionDropZones(html, sheet) {
  const zones = html.find(".rmss-power-modifier-profession-drop");
  zones.each((_, el) => {
    el.addEventListener("dragenter", ev => {
      ev.preventDefault();
      el.classList.add("drag-hover");
    });
    el.addEventListener("dragleave", ev => {
      if (!el.contains(ev.relatedTarget)) el.classList.remove("drag-hover");
    });
    el.addEventListener("dragover", ev => {
      ev.preventDefault();
      ev.stopPropagation();
      ev.dataTransfer.dropEffect = "copy";
    });
    el.addEventListener("drop", ev => {
      el.classList.remove("drag-hover");
      _handleProfessionDrop(ev, sheet, el);
    });
  });
}

/**
 * Internal handler for profession drop.
 */
async function _handleProfessionDrop(event, sheet, zone) {
  event.preventDefault();
  event.stopPropagation();

  let data;
  try {
    const raw = event.dataTransfer.getData("text/plain")
             || event.dataTransfer.getData("application/json");
    data = JSON.parse(raw);
  } catch {
    return;
  }
  if (!data) return;

  let uuid = data.uuid;
  if (!uuid && data.type === "Item" && data.data?._id) {
    uuid = `Item.${data.data._id}`;
  }
  if (!uuid) return;

  const dropped = await fromUuid(uuid);
  if (!dropped || dropped.type !== "profession") {
    ui.notifications.warn(game.i18n.localize("rmss.item.drop_profession_only"));
    return;
  }

  const field = zone.dataset?.powerModifier;
  if (field !== "pp_multiplier" && field !== "spell_adder") return;
  const updatePath = field === "pp_multiplier"
    ? "system.pp_multiplier_profession"
    : "system.spell_adder_profession";
  await sheet.item.update({ [updatePath]: dropped.uuid ?? uuid });
  sheet.render(false);
}

/**
 * Build spellData for enchantment storage. Makes the enchantment independent of any spell document.
 * Incluye flags (p. ej. rmss.macro) para que Use enchantment ejecute el script vía spell.use().
 * @param {{ name: string, img?: string, system: Object, flags?: object } | Item} spellDocOrData - Spell Item or spellData object
 * @returns {{ name: string, img: string, system: Object, flags?: object }} Data to store in enchantment.spellData
 */
export function buildSpellDataForStorage(spellDocOrData) {
  if (!spellDocOrData) return null;
  const name = spellDocOrData.name ?? "";
  const img = spellDocOrData.img ?? "systems/rmss/assets/default/spell.svg";
  const system = foundry.utils.duplicate(spellDocOrData.system ?? {});
  const out = { name, img, system };
  const flags = spellDocOrData.flags;
  if (flags && typeof flags === "object" && Object.keys(flags).length > 0) {
    out.flags = foundry.utils.duplicate(flags);
  }
  return out;
}

/**
 * Resolve spell for casting from enchantment.
 * Priority: 1) spellData (create temp Item), 2) spellUuid, 3) spellListUuid+name (from embedded list), 4) actor.items.find (legacy).
 * @param {Object} enchantment
 * @param {Actor} actor
 * @returns {Promise<Item|null>} Spell Item for casting, or null
 */
export async function resolveSpellForEnchantment(enchantment, actor) {
  if (enchantment.spellData?.name && enchantment.spellData?.system) {
    const spellData = {
      name: enchantment.spellData.name,
      type: "spell",
      img: enchantment.spellData.img || "systems/rmss/assets/default/spell.svg",
      system: foundry.utils.duplicate(enchantment.spellData.system)
    };
    const fd = enchantment.spellData.flags;
    if (fd && typeof fd === "object" && Object.keys(fd).length > 0) {
      spellData.flags = foundry.utils.duplicate(fd);
    }
    return await Item.create(spellData, { temporary: true });
  }
  if (enchantment.spellUuid) {
    const doc = await fromUuid(enchantment.spellUuid);
    if (doc?.type === "spell") return doc;
  }
  if (enchantment.spellListUuid && enchantment.spell) {
    const spellList = await fromUuid(enchantment.spellListUuid);
    if (spellList?.type === "spell_list" && spellList.system?.spells) {
      const embedded = spellList.system.spells.find(
        (s) => (s?.name ?? "") === enchantment.spell
      );
      if (embedded?.name && embedded?.system) {
        const spellData = {
          name: embedded.name,
          type: "spell",
          img: embedded.img || "systems/rmss/assets/default/spell.svg",
          system: foundry.utils.duplicate(embedded.system ?? {})
        };
        const ef = embedded.flags;
        if (ef && typeof ef === "object" && Object.keys(ef).length > 0) {
          spellData.flags = foundry.utils.duplicate(ef);
        }
        return await Item.create(spellData, { temporary: true });
      }
    }
  }
  const found = actor.items.find((i) => i.type === "spell" && i.name === enchantment.spell);
  return found ?? null;
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
