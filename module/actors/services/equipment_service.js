import ItemService from "./item_service.js";
import ArmorInfoService from "./armor_info_service.js";

/**
 * Service for equipment and hands-occupied logic (Issue #94).
 * - Weapons: usable only if equipped (or natural weapon, always equipped)
 * - Hands: 1H weapon = 1, 2H weapon = 2, shield = 1, natural weapon = 0
 * - Max 2 hands occupied
 */
export default class EquipmentService {

  static MAX_HANDS = 2;

  /**
   * Returns hands used by a weapon (0 for natural weapons and creature_attack).
   * Derived from type: 1he/1hc/th/pa1h→1, 2h/mis/pa2h→2.
   * @param {Item} weapon - Weapon or creature_attack item
   * @returns {number} 0, 1, or 2
   */
  static getWeaponHands(weapon) {
    if (!weapon) return 0;
    if (weapon.type === "creature_attack") return 0;
    if (weapon.system?.isNaturalWeapon === true) return 0;
    const type = weapon.system?.type || "";
    if (["2h", "mis", "pa2h"].includes(type)) return 2;
    return 1; // 1he, 1hc, th, pa1h
  }

  /**
   * Get armor slot (body, helmet, shield). Uses armorSlot, falls back to isShield.
   * @param {Item} armor - Armor item
   * @returns {string} "body" | "helmet" | "shield"
   */
  static getArmorSlot(armor) {
    if (!armor || armor.type !== "armor") return "body";
    return armor.system?.armorSlot || (armor.system?.isShield ? "shield" : "body");
  }

  /**
   * Returns hands used by equipped armor (shield = 1).
   * @param {Item} armor - Armor item
   * @returns {number} 0 or 1
   */
  static getArmorHands(armor) {
    if (!armor || armor.type !== "armor") return 0;
    if (this.getArmorSlot(armor) === "shield" && armor.system?.equipped === true) return 1;
    return 0;
  }

  /**
   * Hands occupied for spell casting. 2H weapons (staff, etc.) count as 1 hand:
   * the mage holds the staff in one hand while casting with the other.
   * @param {Actor} actor
   * @returns {number} 0–2
   */
  static getHandsOccupiedForCasting(actor) {
    if (!actor?.items) return 0;
    let total = 0;
    for (const item of actor.items) {
      if (item.type === "weapon" && item.system?.equipped === true) {
        total += Math.min(this.getWeaponHands(item), 1);
      } else if (item.type === "creature_attack") {
        total += this.getWeaponHands(item);
      } else if (item.type === "armor") {
        total += this.getArmorHands(item);
      }
    }
    return Math.min(total, this.MAX_HANDS);
  }

  /**
   * Total hands occupied by actor's equipped weapons and shields.
   * @param {Actor} actor
   * @returns {number} 0–2
   */
  static getHandsOccupied(actor) {
    if (!actor?.items) return 0;
    let total = 0;
    for (const item of actor.items) {
      if (item.type === "weapon" && item.system?.equipped === true) {
        total += this.getWeaponHands(item);
      } else if (item.type === "creature_attack") {
        total += this.getWeaponHands(item);
      } else if (item.type === "armor") {
        total += this.getArmorHands(item);
      }
    }
    return Math.min(total, this.MAX_HANDS);
  }

  /**
   * Whether a weapon is effectively equipped (usable for attack).
   * Natural weapons and creature_attack are always equipped.
   * @param {Item} weapon
   * @returns {boolean}
   */
  static isWeaponEquipped(weapon) {
    if (!weapon) return false;
    if (weapon.type === "creature_attack") return true;
    if (weapon.system?.isNaturalWeapon === true) return true;
    return weapon.system?.equipped === true;
  }

  /**
   * Hands that would be added if the item were equipped.
   * @param {Item} item - weapon or armor
   * @returns {number}
   */
  static getItemHandsIfEquipped(item) {
    if (!item) return 0;
    if (item.type === "weapon") return this.getWeaponHands(item);
    if (item.type === "armor" && this.getArmorSlot(item) === "shield") return 1;
    return 0;
  }

  /**
   * Check if equipping this armor would conflict with another equipped armor in the same slot.
   * Only one armor per slot (body, helmet, shield) can be equipped.
   * @param {Actor} actor
   * @param {Item} item - armor item to equip
   * @returns {{ valid: boolean, reason?: string }}
   */
  static canEquipArmor(actor, item) {
    if (!actor?.items || item?.type !== "armor") return { valid: true };
    const slot = this.getArmorSlot(item);
    const itemId = item.id ?? item._id;
    if (slot === "shield" && this.hasEquippedTwoHandedWeapon(actor)) {
      return { valid: false, reason: "shield_with_two_handed_weapon" };
    }
    const equippedInSlot = actor.items.find(
      (i) => i.type === "armor" && (i.id ?? i._id) !== itemId && i.system?.equipped && this.getArmorSlot(i) === slot
    );
    if (equippedInSlot) {
      return { valid: false, reason: "armor_slot_occupied" };
    }
    return { valid: true };
  }

  /**
   * Equipped weapons only (weapon type, equipped=true). Excludes natural weapons and creature_attack.
   * Used to determine if weapon skill bonus applies (only when exactly one weapon equipped).
   * @param {Actor} actor
   * @returns {Item[]}
   */
  static getEquippedWeapons(actor) {
    if (!actor?.items) return [];
    return actor.items.filter(
      (i) => i.type === "weapon" && i.system?.equipped === true && i.system?.isNaturalWeapon !== true
    );
  }

  /**
   * Whether the actor has a two-handed weapon equipped (2h, pole arm 2h, missile).
   * Natural weapons are excluded (they do not occupy hands).
   * @param {Actor} actor
   * @returns {boolean}
   */
  static hasEquippedTwoHandedWeapon(actor) {
    if (!actor?.items) return false;
    for (const item of actor.items) {
      if (item.type !== "weapon" || item.system?.equipped !== true) continue;
      if (item.system?.isNaturalWeapon === true) continue;
      if (this.getWeaponHands(item) >= 2) return true;
    }
    return false;
  }

  /**
   * Check if equipping this item would exceed MAX_HANDS.
   * For weapons: allows 2 weapons only when both are 1-handed AND have different offensive_skill.
   * @param {Actor} actor
   * @param {Item} item - The item to equip
   * @returns {{ valid: boolean, currentHands: number, itemHands: number, reason?: string }}
   */
  static canEquip(actor, item) {
    const currentHands = this.getHandsOccupied(actor);
    const itemHands = this.getItemHandsIfEquipped(item);
    const wouldExceed = (currentHands + itemHands) > this.MAX_HANDS;
    if (wouldExceed) {
      return { valid: false, currentHands, itemHands, reason: "hands_limit_exceeded" };
    }

    if (item.type === "weapon" && item.system?.isNaturalWeapon !== true) {
      const equippedWeapons = this.getEquippedWeapons(actor);
      if (equippedWeapons.length >= 1) {
        const newWeaponHands = this.getWeaponHands(item);
        const existingWeapon = equippedWeapons[0];
        const existingHands = this.getWeaponHands(existingWeapon);
        const bothOneHanded = newWeaponHands === 1 && existingHands === 1;
        const newSkill = (item.system?.offensive_skill || "").trim();
        const existingSkill = (existingWeapon.system?.offensive_skill || "").trim();
        const sameSkill = newSkill && existingSkill && newSkill === existingSkill;
        if (!bothOneHanded) {
          return { valid: false, currentHands, itemHands, reason: "dual_wield_both_one_handed" };
        }
        if (sameSkill) {
          return { valid: false, currentHands, itemHands, reason: "dual_wield_same_skill" };
        }
      }
    }

    return { valid: true, currentHands, itemHands };
  }

  /**
   * Equip/unequip a weapon or armor item, or toggle "worn" for a plain item/herb (which have no
   * separate equipped state) - the exact logic RMSSCharacterSheet's own ".equippable" click
   * handler used to have inline, extracted so the Argon HUD equipment panel can call the same
   * validated toggle instead of duplicating the hand-count/armor-slot rules.
   * @param {Actor} actor
   * @param {Item} item
   * @returns {Promise<boolean>} true if the item's equipped/worn state actually changed
   */
  static async toggleEquipped(actor, item) {
    if (!actor || !item) return false;

    if (["item", "herb_or_poison"].includes(item.type)) {
      await ItemService.toggleWorn(item);
      return true;
    }

    if (item.system.equipped === true) {
      await item.update({ system: { equipped: false } });
      if (item.type === "armor") await ArmorInfoService.updateActorArmorInfo(actor);
      return true;
    }

    if (item.type === "armor") {
      const armorCheck = this.canEquipArmor(actor, item);
      if (!armorCheck.valid) {
        const armorMsg = armorCheck.reason === "shield_with_two_handed_weapon"
          ? game.i18n.localize("rmss.equipment.shield_with_two_handed_weapon")
          : game.i18n.localize("rmss.equipment.armor_slot_occupied");
        ui.notifications.warn(armorMsg);
        return false;
      }
    }

    const { valid, currentHands, itemHands, reason } = this.canEquip(actor, item);
    if (!valid) {
      const msg = reason === "dual_wield_same_skill"
        ? game.i18n.localize("rmss.equipment.dual_wield_same_skill")
        : reason === "dual_wield_both_one_handed"
          ? game.i18n.localize("rmss.equipment.dual_wield_both_one_handed")
          : game.i18n.format("rmss.equipment.hands_limit_exceeded", {
              current: currentHands,
              adding: itemHands,
              max: this.MAX_HANDS
            });
      ui.notifications.warn(msg);
      return false;
    }

    if (item.type === "weapon" && item.system?.isNaturalWeapon !== true) {
      const equippedWeapons = this.getEquippedWeapons(actor);
      if (equippedWeapons.length >= 1) {
        ui.notifications.warn(game.i18n.localize("rmss.equipment.weapon_bonus_no_second_weapon"));
      }
    }

    // A weapon in hand, or armor being worn, is necessarily carried too.
    const equipUpdate = ["weapon", "armor"].includes(item.type) ? { equipped: true, worn: true } : { equipped: true };
    await item.update({ system: equipUpdate });
    if (item.type === "armor") await ArmorInfoService.updateActorArmorInfo(actor);
    return true;
  }

  /**
   * Same as toggleEquipped, but never blocks with a warning when equipping (not unequipping) runs
   * into a hand-limit/slot conflict with something the actor already has equipped - it unequips
   * the conflicting item(s) first instead, then equips the requested one. A valid dual-wield combo
   * (two different-skill one-handed weapons) is left untouched, exactly like toggleEquipped - this
   * only kicks in on what would otherwise be a blocked equip. Meant for the Argon HUD's Equipment
   * panel, where "click a different weapon" reads as "wear this instead", not "try to add it on
   * top and tell me if it doesn't fit" - the sheet's own equip icons keep calling toggleEquipped
   * unchanged.
   * @param {Actor} actor
   * @param {Item} item
   * @returns {Promise<boolean>} true if the item's equipped/worn state actually changed
   */
  static async swapEquip(actor, item) {
    if (!actor || !item) return false;

    if (["item", "herb_or_poison"].includes(item.type)) {
      await ItemService.toggleWorn(item);
      return true;
    }

    if (item.system.equipped === true) {
      await item.update({ system: { equipped: false } });
      if (item.type === "armor") await ArmorInfoService.updateActorArmorInfo(actor);
      return true;
    }

    const toUnequip = new Set();

    if (item.type === "armor") {
      const slot = this.getArmorSlot(item);
      const itemId = item.id ?? item._id;
      if (slot === "shield" && this.hasEquippedTwoHandedWeapon(actor)) {
        for (const w of this.getEquippedWeapons(actor)) toUnequip.add(w);
      }
      const sameSlot = actor.items.find(
        (i) => i.type === "armor" && (i.id ?? i._id) !== itemId && i.system?.equipped && this.getArmorSlot(i) === slot
      );
      if (sameSlot) toUnequip.add(sameSlot);
    } else if (!this.canEquip(actor, item).valid) {
      // Whatever the exact reason (hands exceeded, dual-wield skill clash...), the simplest and
      // most predictable "swap" is to clear every currently-equipped weapon and shield, then
      // equip the requested one on a clean slate.
      for (const w of this.getEquippedWeapons(actor)) toUnequip.add(w);
      const shield = actor.items.find((i) => i.type === "armor" && i.system?.equipped && this.getArmorSlot(i) === "shield");
      if (shield) toUnequip.add(shield);
    }

    for (const u of toUnequip) {
      await u.update({ system: { equipped: false } });
      if (u.type === "armor") await ArmorInfoService.updateActorArmorInfo(actor);
    }

    return this.toggleEquipped(actor, item);
  }
}
