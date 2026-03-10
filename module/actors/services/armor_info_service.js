/**
 * Service to compute and update actor armor_info from equipped armor items.
 * - armor_type (AT): from equipped body armor
 * - shield_bonus: from equipped shield bonus
 * - magic: from equipped body + helmet bonuses (combined)
 * - total_db: recalculated from quickness_bonus + adrenal_defense + magic + shield_bonus - quickness_penalty
 */
export default class ArmorInfoService {

  /**
   * Get equipped armor items grouped by slot.
   * @param {Actor} actor
   * @returns {{ body: Item|null, helmet: Item|null, shield: Item|null }}
   */
  static getEquippedArmorBySlot(actor) {
    const result = { body: null, helmet: null, shield: null };
    if (!actor?.items) return result;

    for (const item of actor.items) {
      if (item.type !== "armor" || !item.system?.equipped) continue;
      const slot = item.system.armorSlot || (item.system.isShield ? "shield" : "body");
      if (result[slot] === null) result[slot] = item;
    }
    return result;
  }

  /**
   * Compute armor_info values from equipped armor items.
   * @param {Actor} actor
   * @returns {{ armor_type: number, shield_bonus: number, magic: number }}
   */
  static computeFromEquipment(actor) {
    const equipped = this.getEquippedArmorBySlot(actor);
    const bonus = (item) => Number(item?.system?.bonus) || 0;

    const armor_type = equipped.body ? (Number(equipped.body.system?.at) || 1) : 1;
    const shield_bonus = equipped.shield ? bonus(equipped.shield) : 0;
    const magic = (equipped.body ? bonus(equipped.body) : 0) + (equipped.helmet ? bonus(equipped.helmet) : 0);

    return { armor_type, shield_bonus, magic };
  }

  /**
   * Update actor armor_info from equipped armor. Preserves other armor_info fields.
   * Recalculates total_db.
   * @param {Actor} actor
   */
  static async updateActorArmorInfo(actor) {
    if (!actor?.system?.armor_info) return;

    const { armor_type, shield_bonus, magic } = this.computeFromEquipment(actor);
    const armorInfo = actor.system.armor_info;

    const quicknessBonus = Number(armorInfo.quickness_bonus) || 0;
    const adrenalDefense = Number(armorInfo.adrenal_defense) || 0;
    const quicknessPenalty = Number(armorInfo.quickness_penalty) || 0;
    const total_db = Math.max(0, quicknessBonus + adrenalDefense + magic + shield_bonus - quicknessPenalty);

    await actor.update({
      "system.armor_info.armor_type": armor_type,
      "system.armor_info.shield_bonus": shield_bonus,
      "system.armor_info.magic": magic,
      "system.armor_info.total_db": total_db
    });
  }
}
