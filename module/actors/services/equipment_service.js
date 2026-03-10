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
}
