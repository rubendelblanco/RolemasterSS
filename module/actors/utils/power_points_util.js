/**
 * Power point calculations considering equipped items (PP multiplier, spell adder).
 * PP adder adds to base; PP multiplier (≥2) multiplies the total. If multiple multipliers apply,
 * the highest is used (they do NOT stack). @see Spell User's Companion 6.17.2
 */

/**
 * Get equipped items (weapon, armor, item) that can affect PP.
 * @param {Actor} actor
 * @returns {Item[]}
 */
function getEquippedPPItems(actor) {
  if (!actor?.items) return [];
  return actor.items.filter((i) => {
    if (!["weapon", "armor", "item"].includes(i.type)) return false;
    if (i.type === "weapon" || i.type === "armor") return i.system?.equipped === true;
    if (i.type === "item") return i.system?.worn === true;
    return false;
  });
}

/**
 * Check if an item's realm filter matches the spell realm.
 * Handles hybrid realms (essence/channeling, etc.) via CONFIG.rmss.item_pp_realm_expands.
 * @param {string} itemRealm - "" | "all" | "essence" | "channeling" | ...
 * @param {string} spellRealm - e.g. "essence", "channeling"
 * @returns {boolean}
 */
function realmMatches(itemRealm, spellRealm) {
  if (!itemRealm) return false;
  if (itemRealm === "all") return true;
  if (itemRealm === "profession") return false; // Handled in professionMatches
  const expands = CONFIG.rmss?.item_pp_realm_expands?.[itemRealm];
  if (expands) return expands.includes(spellRealm);
  return itemRealm === spellRealm;
}

/**
 * Check if item's profession filter matches the actor's profession.
 * @param {string} itemProfUuid - Profession uuid from item (pp_multiplier_profession or spell_adder_profession)
 * @param {Actor} actor
 */
function professionMatches(itemProfUuid, actor) {
  if (!itemProfUuid?.trim()) return false;
  const actorProfession = actor?.items?.find((i) => i.type === "profession");
  if (!actorProfession) return false;
  if (itemProfUuid.startsWith("Actor.") || itemProfUuid.startsWith("Item.")) {
    return actorProfession.uuid === itemProfUuid || actorProfession.id === itemProfUuid.split(".").pop();
  }
  return actorProfession.name === itemProfUuid;
}

/**
 * Effective max power points for casting spells of the given realm.
 * Formula: (base + sumAdders) * productMultipliers
 * @param {Actor} actor
 * @param {string} spellRealm - "essence" | "channeling" | "mentalism" | "arcane"
 * @param {number} [basePP] - Override base PP (e.g. from skills). If omitted, uses actor.system.attributes.power_points.max
 * @returns {number}
 */
export function getEffectivePowerPointsMax(actor, spellRealm, basePP) {
  const base = basePP !== undefined
    ? basePP
    : Number(actor?.system?.attributes?.power_points?.max ?? actor?.system?.attributes?.power_points?.base ?? 0);
  const items = getEquippedPPItems(actor);

  let adders = 0;
  let maxMultiplier = 1;

  for (const item of items) {
    const sys = item.system || {};
    const ppMult = Number(sys.pp_multiplier) || 1;
    const ppMultRealm = sys.pp_multiplier_realm || "";
    const ppMultProf = sys.pp_multiplier_profession || "";
    const spellAdd = Number(sys.spell_adder) || 0;
    const spellAddRealm = sys.spell_adder_realm || "";
    const spellAddProf = sys.spell_adder_profession || "";

    const ppMultApplies = ppMultRealm === "profession"
      ? professionMatches(ppMultProf, actor)
      : realmMatches(ppMultRealm, spellRealm);
    const spellAddApplies = spellAddRealm === "profession"
      ? professionMatches(spellAddProf, actor)
      : realmMatches(spellAddRealm, spellRealm);

    if (spellAdd > 0 && spellAddApplies) adders += spellAdd;
    if (ppMult >= 2 && ppMultApplies) maxMultiplier = Math.max(maxMultiplier, ppMult);
  }

  return Math.floor((base + adders) * maxMultiplier);
}

const REALMS = ["essence", "channeling", "mentalism", "arcane"];

/**
 * Effective max PP for the sheet display and recovery.
 * Uses the maximum across all realms (items may grant realm-specific bonuses).
 * @param {Actor} actor
 * @param {number} [basePP] - Base PP from skills. If omitted, uses stored max/base.
 * @returns {number}
 */
export function getEffectivePowerPointsMaxForSheet(actor, basePP) {
  const stored = basePP ?? Number(actor?.system?.attributes?.power_points?.max ?? actor?.system?.attributes?.power_points?.base ?? 0);
  let max = stored;
  for (const realm of REALMS) {
    max = Math.max(max, getEffectivePowerPointsMax(actor, realm, stored));
  }
  return max;
}
