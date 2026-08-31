import { buildEnchantmentList, resolveSpellForEnchantment, getChargePool, normalizeEnchantments } from "./enchantment_utils.js";
import { isIdentityHidden } from "../../actors/utils/item_identity_util.js";
import { normalizePassiveModifiers } from "../../actors/services/passive_item_modifiers_service.js";
import { getWeaponSlayingArray } from "./weapon_slaying_ui.js";

/**
 * At-a-glance bonus-skill badges (e.g. "+10 Stalking/Hiding") from system.bonus_skills:
 * [{ skill, skill_name, bonus }]. Reuses normalizeEnchantments as a generic array/corrupted-
 * object normalizer - same shape issue any of these embedded arrays can have.
 * @param {object} system - item.system
 * @returns {Array<{ value: number, sign: string, skillName: string, positive: boolean, tooltip: string }>}
 */
function buildBonusSkillBadges(system) {
  const entries = normalizeEnchantments(system?.bonus_skills);
  return entries
    .map((e) => {
      const value = Number(e?.bonus) || 0;
      const skillName = (e?.skill_name || "").trim() || e?.skill || "—";
      const sign = value >= 0 ? "+" : "";
      return {
        value,
        sign,
        skillName,
        positive: value >= 0,
        tooltip: game.i18n.format("rmss.item.bonus_skill_badge_tooltip", { skill: skillName, sign, value })
      };
    })
    .filter((b) => b.value !== 0);
}

/**
 * At-a-glance passive modifier badges (e.g. "+5 Initiative", "-3 Essence RR") - same value
 * this item's worn/equipped ActiveEffect actually applies, see buildChangesForModifier in
 * passive_item_modifiers_service.js (subtract negates, add/override use the value as-is).
 * @param {object} system - item.system
 * @returns {Array<{ value: number, sign: string, label: string, icon: string }>}
 */
function buildPassiveModifierBadges(system) {
  const mods = normalizePassiveModifiers(system?.passive_modifiers);
  return mods
    .map((m) => {
      const rawVal = Number(m.value) || 0;
      const value = m.action === "subtract" ? -rawVal : rawVal;
      let label, icon;
      switch (m.target) {
        case "initiative":
          label = game.i18n.localize("rmss.item.passive_mod_target_initiative");
          icon = "fa-gauge-high";
          break;
        case "stat_special":
          label = game.i18n.localize(`rmss.player_character.attribute.${m.statKey}`) || m.statKey;
          icon = "fa-arrow-trend-up";
          break;
        case "resistance_roll":
          label = m.rrKey === "all"
            ? game.i18n.localize("rmss.item.passive_mod_rr_all")
            : (game.i18n.localize(`rmss.item.passive_mod_rr.${m.rrKey}`) || m.rrKey);
          icon = "fa-shield-virus";
          break;
        case "armor_magic":
        default:
          label = game.i18n.localize("rmss.item.passive_mod_target_armor_magic");
          icon = "fa-shield-halved";
          break;
      }
      const sign = value >= 0 ? "+" : "";
      return {
        value,
        sign,
        label,
        icon,
        positive: value >= 0,
        tooltip: game.i18n.format("rmss.item.passive_mod_badge_tooltip", { label, sign, value })
      };
    })
    .filter((b) => b.value !== 0);
}

/**
 * @param {Item|{ system?: object }} itemOrSystem
 * @param {string} tag
 * @returns {boolean}
 */
function itemHasTag(itemOrSystem, tag) {
  const sys = itemOrSystem?.system ?? itemOrSystem;
  const tags = sys?.tags;
  if (!Array.isArray(tags)) return false;
  return tags.some(t => String(t).trim().toLowerCase() === tag);
}

/**
 * @param {Item|{ system?: object }} itemOrSystem
 * @returns {boolean}
 */
export function itemHasPotionTag(itemOrSystem) {
  return itemHasTag(itemOrSystem, "potion");
}

/**
 * Artifacts unlock the shared charge pool ("pooled" enchantment usage) and the fixed cast
 * level override — both stay at their inert defaults (0) on regular items.
 * @param {Item|{ system?: object }} itemOrSystem
 * @returns {boolean}
 */
export function itemHasArtifactTag(itemOrSystem) {
  return itemHasTag(itemOrSystem, "artifact");
}

/**
 * @param {Item|{ system?: object }} item
 * @returns {Array<{ index: number, spellLabel: string, usageLabel: string }>}
 */
export function getUsableEnchantmentsForItem(item) {
  const list = buildEnchantmentList(item.system?.magic?.enchantments);
  const out = [];
  for (let index = 0; index < list.length; index++) {
    const e = list[index];
    if (!e.canUse) continue;
    const spellLabel = e.spell?.trim()
      ? e.spell
      : (e.spellListName && e.spellListName !== "—" ? e.spellListName : "—");
    out.push({ index, spellLabel, usageLabel: e.usageLabel });
  }
  return out;
}

/**
 * Mutates item POJO used in actor sheet templates.
 * @param {object} itemPlain
 */
export function attachItemMagicActionFlags(itemPlain) {
  if (!itemPlain?.system) {
    itemPlain.rmssShowItemMagicAction = false;
    itemPlain.rmssItemMagicIsPotion = false;
    itemPlain.rmssChargePool = null;
    itemPlain.rmssEnchantmentCharges = [];
    itemPlain.rmssPassiveBadges = [];
    itemPlain.rmssSkillBonusBadges = [];
    itemPlain.rmssBonusBadge = null;
    itemPlain.rmssSlayingBadge = null;
    return;
  }
  const usable = getUsableEnchantmentsForItem(itemPlain);
  // An unidentified item's magic is unknown to the player — no action icon to use it,
  // that'd be a dead giveaway that it does something. GMs still see/use it (isIdentityHidden
  // is false for them regardless of the flag) e.g. to test the enchantment.
  const identityHidden = isIdentityHidden(itemPlain);
  itemPlain.rmssShowItemMagicAction = usable.length > 0 && !identityHidden;
  const list = buildEnchantmentList(itemPlain.system?.magic?.enchantments);
  const hasSingleUsable = usable.some(u => (list[u.index]?.usage ?? "passive") === "single");
  itemPlain.rmssItemMagicIsPotion = itemHasPotionTag(itemPlain) && hasSingleUsable;

  // At-a-glance charge count for artifacts with a shared pool, same idea as the spell-adder
  // pips - same identity-hidden gate as the magic action icon above, for the same reason.
  const pool = getChargePool(itemPlain.system);
  itemPlain.rmssChargePool = pool.max > 0 && !identityHidden ? pool : null;

  // At-a-glance passive modifiers (worn/equipped bonuses like "+5 Initiative"), same gate.
  itemPlain.rmssPassiveBadges = identityHidden ? [] : buildPassiveModifierBadges(itemPlain.system);

  // At-a-glance bonus-skill badges (e.g. "+10 Stalking/Hiding"), same gate.
  itemPlain.rmssSkillBonusBadges = identityHidden ? [] : buildBonusSkillBadges(itemPlain.system);

  // At-a-glance flat weapon OB / armor DB bonus. Used to be baked into the item's name as
  // " +N"/" -N" (item_auto_name_util.js) - a badge instead, same gate as everything else.
  const flatBonus = Number(itemPlain.system?.bonus) || 0;
  const isArmor = itemPlain.type === "armor";
  itemPlain.rmssBonusBadge = (flatBonus !== 0 && !identityHidden)
    ? {
      value: flatBonus,
      sign: flatBonus >= 0 ? "+" : "",
      positive: flatBonus >= 0,
      icon: isArmor ? "fa-shield-halved" : "fa-sword",
      tooltip: game.i18n.format(isArmor ? "rmss.item.armor_bonus_tooltip" : "rmss.item.weapon_bonus_tooltip", {
        sign: flatBonus >= 0 ? "+" : "",
        value: flatBonus
      })
    }
    : null;

  // At-a-glance Slaying bonus (e.g. "+10, +25 vs Orcs" weapons): the delta the weapon's OB
  // gets bumped to against a matching creature tag, on top of the flat bonus badge above -
  // see _getSlayingBonusDelta in rmss_weapon_skill_manager.js for the actual combat math.
  const slayingTags = itemPlain.type === "weapon" ? getWeaponSlayingArray(itemPlain.system) : [];
  const slayingDelta = slayingTags.length > 0 ? (Number(itemPlain.system?.slaying_bonus) || 0) - flatBonus : 0;
  itemPlain.rmssSlayingBadge = (slayingDelta !== 0 && !identityHidden)
    ? {
      value: slayingDelta,
      sign: slayingDelta >= 0 ? "+" : "",
      positive: slayingDelta >= 0,
      tooltip: game.i18n.format("rmss.item.slaying_badge_tooltip", {
        sign: slayingDelta >= 0 ? "+" : "",
        value: slayingDelta,
        tags: slayingTags.join(", ")
      })
    }
    : null;

  // Per-enchantment charge counts (daily/charged usage). The badge itself only shows the
  // current count - this is meant as a quick "still got some?" glance, not a full readout -
  // the max only shows up in the tooltip.
  itemPlain.rmssEnchantmentCharges = identityHidden ? [] : list
    .filter(e => e.usage === "daily" || e.usage === "charged")
    .map(e => {
      const isDaily = e.usage === "daily";
      const current = isDaily ? e.usesRemaining : e.charges;
      const max = isDaily ? e.usesPerDay : e.chargesMax;
      // Same fallback as getUsableEnchantmentsForItem: named spell, else the spell list,
      // else nothing to name it by - which spell this badge tracks matters once an item
      // has more than one daily/charged enchantment.
      const spell = e.spell?.trim() ? e.spell : (e.spellListName && e.spellListName !== "—" ? e.spellListName : "—");
      return {
        usage: e.usage,
        current,
        icon: isDaily ? "fa-clock" : "fa-bolt",
        tooltip: game.i18n.format(isDaily ? "rmss.item.daily_charge_tooltip" : "rmss.item.charged_tooltip", { spell, current, max })
      };
    });
}

/**
 * Cast enchantment from an owned item (item / weapon / armor).
 * @param {Actor} actor
 * @param {Item} item
 * @param {number} enchantmentIndex
 * @returns {Promise<{ itemDeleted?: boolean, applied?: boolean }>}
 */
export async function castEnchantmentFromItem(actor, item, enchantmentIndex) {
  const enchantments = foundry.utils.duplicate(item.system.magic?.enchantments ?? []);
  const enchantment = enchantments[enchantmentIndex];
  if (!enchantment) return {};

  if (!actor || !(actor instanceof Actor)) {
    ui.notifications.warn(game.i18n.localize("rmss.item.enchantment_need_actor") || "Item must be owned by an actor to use enchantment.");
    return {};
  }

  if (isIdentityHidden(item)) {
    ui.notifications.warn(game.i18n.localize("rmss.item.enchantment_not_identified") || "This item hasn't been identified yet.");
    return {};
  }

  const spellDoc = await resolveSpellForEnchantment(enchantment, actor);
  if (!spellDoc || spellDoc.type !== "spell") {
    ui.notifications.warn(game.i18n.localize("rmss.item.enchantment_spell_not_found") || "Spell not found.");
    return {};
  }

  const spellListName = enchantment.spellListName || spellDoc.name;
  const spellListRealm = enchantment.realm || actor.system?.fixed_info?.realm || "essence";

  const fromEnchantmentOpt = { consumePowerPoints: false, fromEnchantment: true, enchantmentAttackBonus: Number(enchantment.attackBonus) || 0 };
  // Artifact fixed cast level: only meaningful for Force spells today (the only place caster
  // level drives a mechanic — the RR the target must beat). BE/DE damage isn't level-scaled in
  // this system (their book-listed "+N" is already the enchantment's attackBonus).
  const artifactCastLevel = itemHasArtifactTag(item) ? Math.max(0, Number(item.system.magic?.castLevel) || 0) : 0;
  // wasCast: whether the cast actually committed (dice rolled) vs. aborted before that point
  // (e.g. a BE ball spell with no area template placed yet, or a cancelled casting-options
  // dialog). Only consume the enchantment's use/charge/potion when this is true — otherwise a
  // cancelled or blocked cast would burn the item/charge for nothing.
  let wasCast;
  if (spellDoc.system?.instant) {
    const InstantSpellService = (await import("../../spells/services/instant_spell_service.js")).default;
    wasCast = await InstantSpellService.castInstantSpell({ actor, spell: spellDoc, ...fromEnchantmentOpt });
  } else if (spellDoc.system?.type === "BE") {
    const BaseElementalSpellService = (await import("../../spells/services/base_elemental_spell_service.js")).default;
    wasCast = await BaseElementalSpellService.castBaseElementalSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
  } else if (spellDoc.system?.type === "DE") {
    const DirectedElementalSpellService = (await import("../../spells/services/directed_elemental_spell_service.js")).default;
    wasCast = await DirectedElementalSpellService.castDirectedElementalSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
  } else {
    const ForceSpellService = (await import("../../spells/services/force_spell_service.js")).default;
    wasCast = await ForceSpellService.castForceSpell({ actor, spell: spellDoc, spellListName, spellListRealm, casterLevelOverride: artifactCastLevel, ...fromEnchantmentOpt });
  }

  if (!wasCast) return {};

  const usage = enchantment.usage ?? "passive";
  const isPotion = itemHasPotionTag(item);

  if (usage === "single" && isPotion) {
    const qty = Number(item.system.quantity) || 1;
    if (qty > 1) {
      await item.update({ "system.quantity": qty - 1 });
      return { applied: true };
    }
    await item.delete();
    return { itemDeleted: true, applied: true };
  }

  if (usage === "pooled") {
    // Shared item-level pool (e.g. an artifact with N power points split across several
    // spells at different costs each) — the enchantment itself carries no per-use state,
    // only its poolCost; what gets spent is system.magic.chargePool, not this enchantment.
    const pool = item.system.magic?.chargePool ?? { current: 0, max: 0 };
    const cost = Math.max(1, Number(enchantment.poolCost) || 1);
    const newCurrent = Math.max(0, (Number(pool.current) || 0) - cost);
    await item.update({ "system.magic.chargePool.current": newCurrent });
    return { applied: true };
  }

  if (usage === "single") {
    enchantments.splice(enchantmentIndex, 1);
  } else if (usage === "daily") {
    const r = Number(enchantment.usesRemaining) ?? Number(enchantment.usesPerDay) ?? 0;
    enchantment.usesRemaining = Math.max(0, r - 1);
    enchantments[enchantmentIndex] = enchantment;
  } else if (usage === "charged") {
    const c = Number(enchantment.charges) ?? Number(enchantment.chargesMax) ?? 0;
    enchantment.charges = Math.max(0, c - 1);
    enchantments[enchantmentIndex] = enchantment;
  }
  await item.update({ "system.magic.enchantments": enchantments });
  return { applied: true };
}
