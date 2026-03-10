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
   * Returns hands used by equipped armor (shield = 1).
   * @param {Item} armor - Armor item
   * @returns {number} 0 or 1
   */
  static getArmorHands(armor) {
    if (!armor || armor.type !== "armor") return 0;
    if (armor.system?.isShield === true && armor.system?.equipped === true) return 1;
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
    if (item.type === "armor" && item.system?.isShield === true) return 1;
    return 0;
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
   * @param {Actor} actor
   * @param {Item} item - The item to equip
   * @returns {{ valid: boolean, currentHands: number, itemHands: number }}
   */
  static canEquip(actor, item) {
    const currentHands = this.getHandsOccupied(actor);
    const itemHands = this.getItemHandsIfEquipped(item);
    const wouldExceed = (currentHands + itemHands) > this.MAX_HANDS;
    return {
      valid: !wouldExceed,
      currentHands,
      itemHands
    };
  }
}
