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
 * Normalized daily max and remaining uses for a spell adder item.
 * Missing `spell_adder_uses_remaining` is treated as full (max), for legacy items.
 * @param {object} sys - item.system
 * @returns {{ max: number, rem: number }}
 */
function spellAdderMaxAndRemaining(sys) {
  const max = Number(sys?.spell_adder) || 0;
  const raw = sys?.spell_adder_uses_remaining;
  let rem;
  if (raw === undefined || raw === null || raw === "") {
    rem = max;
  } else {
    rem = Number(raw);
    if (!Number.isFinite(rem)) rem = max;
    rem = Math.min(Math.max(0, rem), max);
  }
  return { max, rem };
}

/**
 * Equipped spell adder used for casting options / free casts.
 * Rules:
 * - Only one spell adder “line” per day: if any matching adder has been used
 *   ({@code usesRemaining < max}), only those items count until long rest — no switching
 *   to a higher-bonus full adder the same day.
 * - If none have been used yet, pick the highest {@code spell_adder} value; ties use
 *   the first item in equipped iteration order.
 * - Multiple adders with {@code usesRemaining < max} at once is invalid play; we pick the
 *   first in iteration order. The GM should correct data if that ever happens.
 * @param {Actor} actor
 * @returns {{item: Item, value: number, usesRemaining: number}|null}
 */
export function getMatchingSpellAdder(actor) {
  const actorRealm = actor?.system?.fixed_info?.realm || "";
  if (!actorRealm) return null;

  /** @type {{ item: Item, max: number, rem: number }[]} */
  const rows = [];
  for (const item of getEquippedPPItems(actor)) {
    const sys = item.system || {};
    const { max, rem } = spellAdderMaxAndRemaining(sys);
    if (max <= 0) continue;
    const realm = sys.spell_adder_realm || "";
    const prof = sys.spell_adder_profession || "";
    const applies = realm === "profession"
      ? professionMatches(prof, actor)
      : realmMatches(realm, actorRealm);
    if (!applies) continue;
    rows.push({ item, max, rem });
  }

  if (rows.length === 0) return null;

  const committed = rows.filter((r) => r.rem < r.max);
  if (committed.length > 0) {
    const usable = committed.filter((r) => r.rem > 0);
    if (usable.length === 0) return null;
    const pick = usable[0];
    return { item: pick.item, value: pick.max, usesRemaining: pick.rem };
  }

  const withUses = rows.filter((r) => r.rem > 0);
  if (withUses.length === 0) return null;

  let winner = withUses[0];
  for (let i = 1; i < withUses.length; i++) {
    const r = withUses[i];
    if (r.max > winner.max) winner = r;
  }
  return { item: winner.item, value: winner.max, usesRemaining: winner.rem };
}

/**
 * Consume one daily use of a spell adder item.
 * @param {Item} item - The item with spell_adder
 * @returns {Promise<void>}
 */
export async function consumeSpellAdderUse(item) {
  const current = Number(item.system?.spell_adder_uses_remaining) || 0;
  if (current <= 0) return;
  await item.update({ "system.spell_adder_uses_remaining": current - 1 });
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
