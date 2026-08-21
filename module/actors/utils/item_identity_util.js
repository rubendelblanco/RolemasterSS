/**
 * Unidentified magic items: mask name and any "this is magical" visual cue for
 * anyone who isn't the GM, until system.identified is flipped to true.
 * Applies to item/weapon/armor/herb_or_poison — the types that inherit the
 * "item" sub-template (identified/value_identified/value_unidentified).
 */

const GENERIC_LABEL_KEY = {
  weapon: "rmss.item.unidentified_weapon",
  armor: "rmss.item.unidentified_armor",
  herb_or_poison: "rmss.item.unidentified_herb",
  item: "rmss.item.unidentified_item"
};

/**
 * @param {Item|{type?: string, system?: object}} item
 * @returns {boolean}
 */
export function isIdentityHidden(item) {
  return item?.system?.identified === false && !game.user.isGM;
}

/**
 * Masked display name. "item" type appends its (freeform) tags for a bit more
 * flavor, e.g. "Unknown Item (ring)" — other types just get a fixed generic label.
 * @param {Item|{type?: string, system?: object}} item
 * @returns {string}
 */
export function getUnidentifiedDisplayName(item) {
  const key = GENERIC_LABEL_KEY[item?.type] ?? GENERIC_LABEL_KEY.item;
  const base = game.i18n.localize(key);
  if (item?.type !== "item") return base;
  const tags = Array.isArray(item?.system?.tags)
    ? item.system.tags.map((t) => String(t).trim()).filter(Boolean)
    : [];
  return tags.length > 0 ? `${base} (${tags.join(", ")})` : base;
}

/**
 * The name to actually display to the current viewer.
 * @param {Item|{name?: string, type?: string, system?: object}} item
 * @returns {string}
 */
export function getDisplayName(item) {
  return isIdentityHidden(item) ? getUnidentifiedDisplayName(item) : (item?.name ?? "");
}

/**
 * Icon border/glow class for an item's current status, by priority:
 * holy/unholy ("consecrated" — same visual, only the narrative alignment
 * differs) > slaying (isSlaying, weapon-only) > plain magical. An item can
 * carry more than one of these flags at once (e.g. magical AND holy), hence
 * the priority order rather than combining them. Empty string means no glow,
 * either because the item has none of these flags, or because its identity
 * is hidden from the current viewer.
 * @param {Item|{system?: object}} item
 * @param {boolean} hidden - result of isIdentityHidden(item), passed in to avoid recomputing
 * @returns {string}
 */
function getGlowClass(item, hidden) {
  if (hidden) return "";
  const sys = item?.system;
  if (sys?.holy || sys?.unholy) return "rmss-glow--consecrated";
  if (sys?.isSlaying) return "rmss-glow--slaying";
  if (sys?.magical) return "rmss-glow--magical";
  return "";
}

/**
 * Mutates a plain item object (as used in actor sheet templates) with the
 * display-name and icon-glow fields the templates read.
 * @param {object} itemPlain
 */
export function attachIdentityDisplayFlags(itemPlain) {
  if (!itemPlain) return;
  const hidden = isIdentityHidden(itemPlain);
  itemPlain.rmssIdentityHidden = hidden;
  itemPlain.rmssDisplayName = hidden ? getUnidentifiedDisplayName(itemPlain) : itemPlain.name;
  itemPlain.rmssGlowClass = getGlowClass(itemPlain, hidden);
  // While hidden, show the naive appraisal value instead of the real cost/unitCost
  // (a suspiciously high price is itself a clue that the object is special).
  itemPlain.rmssDisplayCost = hidden ? (Number(itemPlain.system?.value_unidentified) || 0) : (Number(itemPlain.system?.cost) || 0);
  itemPlain.rmssDisplayUnitCost = hidden ? (Number(itemPlain.system?.value_unidentified) || 0) : (Number(itemPlain.system?.unitCost) || 0);
}

/**
 * Same glow-class logic, for contexts without a pre-mutated plain object
 * (e.g. the Items directory hook, working directly off Item documents).
 * @param {Item} item
 * @returns {string}
 */
export function getItemGlowClass(item) {
  return getGlowClass(item, isIdentityHidden(item));
}
