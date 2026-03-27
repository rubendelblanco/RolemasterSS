/**
 * Passive modifiers on items (worn/equipped): stored on system.passive_modifiers,
 * applied as Actor ActiveEffects while the item is active.
 */

/** @type {readonly string[]} */
export const RESISTANCE_ROLL_KEYS = [
  "essence",
  "channeling",
  "mentalism",
  "fear",
  "poison",
  "disease",
  "chann_ess",
  "chann_ment",
  "ess_ment",
  "arcane"
];

const ITEM_TYPES_WITH_PASSIVE = ["item", "weapon", "armor", "herb_or_poison", "transport"];

/**
 * @param {Item} item
 * @returns {boolean}
 */
export function isPassiveItemSlotActive(item) {
  if (!item?.actor) return false;
  const t = item.type;
  if (t === "weapon" || t === "armor") return !!item.system?.equipped;
  if (t === "item" || t === "herb_or_poison" || t === "transport") return !!item.system?.worn;
  return false;
}

/**
 * @param {unknown} raw
 * @returns {object[]}
 */
export function normalizePassiveModifiers(raw) {
  const arr = Array.isArray(raw) ? raw : [];
  return arr.map((e) => ({
    _id: e?._id || foundry.utils.randomID(),
    target: e?.target ?? "armor_magic",
    action: e?.action ?? "add",
    value: Number(e?.value) || 0,
    statKey: e?.statKey ?? "strength",
    rrKey: e?.rrKey ?? "essence"
  }));
}

/**
 * @param {object} system
 * @returns {Array<object & { idx: number }>}
 */
export function buildPassiveModifiersListForSheet(system) {
  const mods = normalizePassiveModifiers(system?.passive_modifiers);
  return mods.map((m, idx) => ({ ...m, idx }));
}

/**
 * Merge flattened form keys system.passive_modifiers.N.field into the array.
 * @param {object} formData
 * @param {Item} item
 */
export function mergePassiveModifiersFormData(formData, item) {
  const prefix = "system.passive_modifiers.";
  const patchKeys = Object.keys(formData).filter((k) => k.startsWith(prefix) && k !== "system.passive_modifiers");
  if (patchKeys.length === 0) return;

  const mods = foundry.utils.duplicate(normalizePassiveModifiers(item.system?.passive_modifiers ?? []));
  for (const key of patchKeys) {
    const rest = key.slice(prefix.length);
    const dotPos = rest.indexOf(".");
    if (dotPos < 0) continue;
    const idx = parseInt(rest.slice(0, dotPos), 10);
    const field = rest.slice(dotPos + 1);
    if (!Number.isInteger(idx) || idx < 0 || idx >= mods.length) continue;
    let val = formData[key];
    if (field === "value") val = Number(val) || 0;
    else if (field === "_id") val = String(val ?? "");
    mods[idx][field] = val;
    delete formData[key];
  }
  formData["system.passive_modifiers"] = mods;
}

/**
 * @param {object} mod — normalized modifier
 * @returns {Array<{ key: string, mode: number, value: number }>}
 */
export function buildChangesForModifier(mod) {
  const ADD = CONST.ACTIVE_EFFECT_MODES?.ADD ?? 2;
  const OVERRIDE = CONST.ACTIVE_EFFECT_MODES?.OVERRIDE ?? 5;

  const action = mod.action ?? "add";
  const mode = action === "override" ? OVERRIDE : ADD;
  const rawVal = Number(mod.value);
  if (!Number.isFinite(rawVal)) return [];
  const val = action === "subtract" ? -rawVal : rawVal;

  const target = mod.target ?? "armor_magic";

  switch (target) {
    case "armor_magic":
      return [{ key: "system.armor_info.magic", mode, value: val }];
    case "initiative":
      return [{ key: "system.attributes.initiative.value", mode, value: val }];
    case "stat_special": {
      const stat = mod.statKey || "strength";
      if (!CONFIG.rmss?.stats?.[stat]) return [];
      return [{ key: `system.stats.${stat}.special_bonus`, mode, value: val }];
    }
    case "resistance_roll": {
      const rr = mod.rrKey ?? "essence";
      const keys = rr === "all" ? [...RESISTANCE_ROLL_KEYS] : [rr];
      return keys
        .filter((k) => RESISTANCE_ROLL_KEYS.includes(k))
        .map((k) => ({
          key: `system.resistance_rolls.${k}.race_mod`,
          mode,
          value: val
        }));
    }
    default:
      return [];
  }
}

/**
 * @param {Item} item
 * @returns {object[]}
 */
function collectPassiveChangesForItem(item) {
  const mods = normalizePassiveModifiers(item.system?.passive_modifiers ?? []);
  const changes = [];
  for (const mod of mods) {
    changes.push(...buildChangesForModifier(mod));
  }
  return changes;
}

/**
 * Remove all passive-item effects from actor, then re-apply from worn/equipped items.
 * @param {Actor} actor
 */
export async function syncPassiveItemEffectsForActor(actor) {
  if (!actor) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const toDelete = actor.effects.filter((e) => e.flags?.rmss?.passiveItemSource).map((e) => e.id);
  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }

  const creates = [];
  for (const item of actor.items) {
    if (!ITEM_TYPES_WITH_PASSIVE.includes(item.type)) continue;
    if (!isPassiveItemSlotActive(item)) continue;
    const changes = collectPassiveChangesForItem(item);
    if (!changes.length) continue;

    const suffix = game.i18n.localize("rmss.item.passive_modifiers_effect_suffix");
    creates.push({
      name: `${item.name} (${suffix})`,
      img: item.img || "icons/svg/aura.svg",
      origin: actor.uuid,
      disabled: false,
      changes,
      flags: {
        rmss: {
          passiveItemSource: item.id
        }
      }
    });
  }

  if (creates.length) {
    await actor.createEmbeddedDocuments("ActiveEffect", creates);
  }
}

/**
 * @param {Actor} actor
 */
export function shouldSyncPassiveEffectsOnItemDiff(diff) {
  if (!diff?.system) return false;
  const s = diff.system;
  return (
    s.passive_modifiers !== undefined ||
    s.worn !== undefined ||
    s.equipped !== undefined
  );
}

/**
 * Labels for RR dropdown on item sheet.
 * @returns {{ key: string, label: string }[]}
 */
export function getRrKeyOptionsForSheet() {
  const all = game.i18n.localize("rmss.item.passive_mod_rr_all");
  return [
    { key: "all", label: all },
    ...RESISTANCE_ROLL_KEYS.map((k) => ({
      key: k,
      label: game.i18n.localize(`rmss.item.passive_mod_rr.${k}`)
    }))
  ];
}

/**
 * @returns {{ key: string, label: string }[]}
 */
export function getStatKeyOptionsForSheet() {
  const stats = CONFIG.rmss?.stats ?? {};
  return Object.keys(stats).map((key) => ({
    key,
    label: stats[key]?.shortname ?? key
  }));
}
