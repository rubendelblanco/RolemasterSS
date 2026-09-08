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
 * EffectChangeData's mode field was renamed to a string `type` in Foundry v14
 * (CONST.ACTIVE_EFFECT_CHANGE_TYPES replaces CONST.ACTIVE_EFFECT_MODES, with
 * different underlying values) - detect which schema this Foundry build uses
 * so passive modifiers keep working on both v13 and v14 hosts.
 * @returns {{ key: "mode"|"type", ADD: number|string, OVERRIDE: number|string }}
 */
function getActiveEffectChangeSchema() {
  if (CONST.ACTIVE_EFFECT_CHANGE_TYPES) {
    return {
      key: "type",
      ADD: CONST.ACTIVE_EFFECT_CHANGE_TYPES.ADD,
      OVERRIDE: CONST.ACTIVE_EFFECT_CHANGE_TYPES.OVERRIDE
    };
  }
  return {
    key: "mode",
    ADD: CONST.ACTIVE_EFFECT_MODES?.ADD ?? 2,
    OVERRIDE: CONST.ACTIVE_EFFECT_MODES?.OVERRIDE ?? 5
  };
}

/**
 * @param {object} mod — normalized modifier
 * @returns {Array<{ key: string, value: number } & ({ mode: number } | { type: string })>}
 */
export function buildChangesForModifier(mod) {
  const schema = getActiveEffectChangeSchema();
  const modeKey = schema.key;

  const action = mod.action ?? "add";
  const mode = action === "override" ? schema.OVERRIDE : schema.ADD;
  const rawVal = Number(mod.value);
  if (!Number.isFinite(rawVal)) return [];
  const val = action === "subtract" ? -rawVal : rawVal;

  const target = mod.target ?? "armor_magic";

  switch (target) {
    case "armor_magic":
      return [{ key: "system.armor_info.magic", [modeKey]: mode, value: val }];
    case "total_db":
      // Applied at data-preparation time, on top of whatever armor_info.total_db already
      // computed to (character quickness formula, npc natural_db, creature intrinsic) - so
      // this works identically for any actor type without special-casing, unlike armor_magic
      // (which gets discarded the next time ArmorInfoService recomputes magic from equipped
      // armor items alone, ignoring actor-level effects to avoid double-counting).
      return [{ key: "system.armor_info.total_db", [modeKey]: mode, value: val }];
    case "initiative":
      return [{ key: "system.attributes.initiative.value", [modeKey]: mode, value: val }];
    case "stat_special": {
      const stat = mod.statKey || "strength";
      if (!CONFIG.rmss?.stats?.[stat]) return [];
      return [{ key: `system.stats.${stat}.special_bonus`, [modeKey]: mode, value: val }];
    }
    case "resistance_roll": {
      const rr = mod.rrKey ?? "essence";
      const keys = rr === "all" ? [...RESISTANCE_ROLL_KEYS] : [rr];
      return keys
        .filter((k) => RESISTANCE_ROLL_KEYS.includes(k))
        .map((k) => ({
          key: `system.resistance_rolls.${k}.race_mod`,
          [modeKey]: mode,
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
 * Reconcile passive-item effects against worn/equipped items, touching only what actually
 * changed. This runs unconditionally on every "ready" (see rmss.js) as a self-healing pass, so a
 * blind delete-then-recreate here would flicker every affected value (e.g. a resistance_rolls
 * total dropping to its unmodified value and back) on every single reload - which Foundry's own
 * token/resource-bar change detection reads as a real change and animates as scrolling combat
 * text. Effects whose computed changes already match the item are left untouched entirely.
 * @param {Actor} actor
 */
export async function syncPassiveItemEffectsForActor(actor) {
  if (!actor) return;
  if (!actor.isOwner && !game.user.isGM) return;

  const existingBySource = new Map();
  for (const effect of actor.effects) {
    const sourceId = effect.flags?.rmss?.passiveItemSource;
    if (sourceId) existingBySource.set(sourceId, effect);
  }

  const suffix = game.i18n.localize("rmss.item.passive_modifiers_effect_suffix");
  const desiredSourceIds = new Set();
  const creates = [];
  const updates = [];

  for (const item of actor.items) {
    if (!ITEM_TYPES_WITH_PASSIVE.includes(item.type)) continue;
    if (!isPassiveItemSlotActive(item)) continue;
    const changes = collectPassiveChangesForItem(item);
    if (!changes.length) continue;

    desiredSourceIds.add(item.id);
    const name = `${item.name} (${suffix})`;
    const img = item.img || "icons/svg/aura.svg";
    const existing = existingBySource.get(item.id);

    if (!existing) {
      creates.push({
        name,
        img,
        origin: actor.uuid,
        disabled: false,
        changes,
        flags: {
          rmss: {
            passiveItemSource: item.id
          }
        }
      });
      continue;
    }

    const isUnchanged = existing.name === name && existing.img === img
      && foundry.utils.objectsEqual(existing.changes, changes);
    if (!isUnchanged) {
      updates.push({ _id: existing.id, name, img, changes });
    }
  }

  // Effects whose source item was unequipped/removed/no longer qualifies
  const toDelete = [...existingBySource.entries()]
    .filter(([sourceId]) => !desiredSourceIds.has(sourceId))
    .map(([, effect]) => effect.id);

  if (toDelete.length) {
    await actor.deleteEmbeddedDocuments("ActiveEffect", toDelete);
  }
  if (updates.length) {
    await actor.updateEmbeddedDocuments("ActiveEffect", updates);
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
