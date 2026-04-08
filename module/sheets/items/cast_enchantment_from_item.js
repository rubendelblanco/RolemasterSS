import { buildEnchantmentList, resolveSpellForEnchantment } from "./enchantment_utils.js";

/**
 * @param {Item|{ system?: object }} itemOrSystem
 * @returns {boolean}
 */
export function itemHasPotionTag(itemOrSystem) {
  const sys = itemOrSystem?.system ?? itemOrSystem;
  const tags = sys?.tags;
  if (!Array.isArray(tags)) return false;
  return tags.some(t => String(t).trim().toLowerCase() === "potion");
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
    return;
  }
  const usable = getUsableEnchantmentsForItem(itemPlain);
  itemPlain.rmssShowItemMagicAction = usable.length > 0;
  const list = buildEnchantmentList(itemPlain.system?.magic?.enchantments);
  const hasSingleUsable = usable.some(u => (list[u.index]?.usage ?? "passive") === "single");
  itemPlain.rmssItemMagicIsPotion = itemHasPotionTag(itemPlain) && hasSingleUsable;
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

  const spellDoc = await resolveSpellForEnchantment(enchantment, actor);
  if (!spellDoc || spellDoc.type !== "spell") {
    ui.notifications.warn(game.i18n.localize("rmss.item.enchantment_spell_not_found") || "Spell not found.");
    return {};
  }

  const spellListName = enchantment.spellListName || spellDoc.name;
  const spellListRealm = enchantment.realm || actor.system?.fixed_info?.realm || "essence";

  const fromEnchantmentOpt = { consumePowerPoints: false, fromEnchantment: true, enchantmentAttackBonus: Number(enchantment.attackBonus) || 0 };
  if (spellDoc.system?.instant) {
    const InstantSpellService = (await import("../../spells/services/instant_spell_service.js")).default;
    await InstantSpellService.castInstantSpell({ actor, spell: spellDoc, ...fromEnchantmentOpt });
  } else if (spellDoc.system?.type === "BE") {
    const BaseElementalSpellService = (await import("../../spells/services/base_elemental_spell_service.js")).default;
    await BaseElementalSpellService.castBaseElementalSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
  } else if (spellDoc.system?.type === "DE") {
    const DirectedElementalSpellService = (await import("../../spells/services/directed_elemental_spell_service.js")).default;
    await DirectedElementalSpellService.castDirectedElementalSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
  } else {
    const ForceSpellService = (await import("../../spells/services/force_spell_service.js")).default;
    await ForceSpellService.castForceSpell({ actor, spell: spellDoc, spellListName, spellListRealm, ...fromEnchantmentOpt });
  }

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
