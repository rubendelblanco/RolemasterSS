/**
 * Power point calculations considering equipped items.
 * PP multiplier (≥2) multiplies the base. If multiple multipliers apply,
 * the highest is used (they do NOT stack). @see Spell User's Companion 6.17.2
 * Spell adders are handled separately in CastingOptionsService (free cast).
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
 * Check if an item's realm filter matches the actor's realm exactly.
 * "all" matches any realm. Otherwise requires exact match (no hybrid expansion).
 * @param {string} itemRealm - "" | "all" | "essence" | "channeling" | "essence/channeling" | ...
 * @param {string} actorRealm - actor.system.fixed_info.realm
 * @returns {boolean}
 */
export function realmMatches(itemRealm, actorRealm) {
  if (!itemRealm) return false;
  if (itemRealm === "all") return true;
  if (itemRealm === "profession") return false;
  return itemRealm === actorRealm;
}

/**
 * Check if item's profession filter matches the actor's profession.
 * @param {string} itemProfUuid - Profession uuid from item
 * @param {Actor} actor
 */
export function professionMatches(itemProfUuid, actor) {
  if (!itemProfUuid?.trim()) return false;
  const actorProfession = actor?.items?.find((i) => i.type === "profession");
  if (!actorProfession) return false;
  if (itemProfUuid.startsWith("Actor.") || itemProfUuid.startsWith("Item.")) {
    return actorProfession.uuid === itemProfUuid || actorProfession.id === itemProfUuid.split(".").pop();
  }
  return actorProfession.name === itemProfUuid;
}

/**
 * Find the first equipped spell adder item whose realm/profession matches the actor.
 * @param {Actor} actor
 * @returns {{item: Item, value: number}|null}
 */
export function getMatchingSpellAdder(actor) {
  const actorRealm = actor?.system?.fixed_info?.realm || "";
  if (!actorRealm) return null;
  for (const item of getEquippedPPItems(actor)) {
    const sys = item.system || {};
    const val = Number(sys.spell_adder) || 0;
    if (val <= 0) continue;
    const realm = sys.spell_adder_realm || "";
    const prof = sys.spell_adder_profession || "";
    const applies = realm === "profession"
      ? professionMatches(prof, actor)
      : realmMatches(realm, actorRealm);
    if (applies) return { item, value: val };
  }
  return null;
}

/**
 * Effective max power points considering equipped PP multiplier items.
 * Formula: base * highestMultiplier
 * @param {Actor} actor
 * @param {string} actorRealm - actor's realm (system.fixed_info.realm)
 * @param {number} [basePP] - Override base PP. If omitted, uses actor.system.attributes.power_points.max
 * @returns {number}
 */
export function getEffectivePowerPointsMax(actor, actorRealm, basePP) {
  const base = basePP !== undefined
    ? basePP
    : Number(actor?.system?.attributes?.power_points?.max ?? actor?.system?.attributes?.power_points?.base ?? 0);
  const items = getEquippedPPItems(actor);

  let maxMultiplier = 1;

  for (const item of items) {
    const sys = item.system || {};
    const ppMult = Number(sys.pp_multiplier) || 1;
    const ppMultRealm = sys.pp_multiplier_realm || "";
    const ppMultProf = sys.pp_multiplier_profession || "";

    const ppMultApplies = ppMultRealm === "profession"
      ? professionMatches(ppMultProf, actor)
      : realmMatches(ppMultRealm, actorRealm);

    if (ppMult >= 2 && ppMultApplies) maxMultiplier = Math.max(maxMultiplier, ppMult);
  }

  return Math.floor(base * maxMultiplier);
}

/**
 * Effective max PP for the sheet display and recovery.
 * Uses the actor's realm (system.fixed_info.realm) for matching.
 * @param {Actor} actor
 * @param {number} [basePP] - Base PP from skills. If omitted, uses stored max/base.
 * @returns {number}
 */
export function getEffectivePowerPointsMaxForSheet(actor, basePP) {
  const stored = basePP ?? Number(actor?.system?.attributes?.power_points?.max ?? actor?.system?.attributes?.power_points?.base ?? 0);
  const actorRealm = actor?.system?.fixed_info?.realm || "";
  if (!actorRealm) return stored;
  return getEffectivePowerPointsMax(actor, actorRealm, stored);
}
