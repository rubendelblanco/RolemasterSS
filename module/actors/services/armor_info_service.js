/**
 * Service to compute and update actor armor_info from equipped armor items.
 * - armor_type (AT): from equipped body armor only
 * - shield_bonus: from equipped shield system.db (defensive bonus)
 * - magic: sum of material bonuses (system.bonus > 0) from all equipped armor (body, helmet, shield)
 * - total_db: recalculated from quickness_bonus + adrenal_defense + magic + shield_bonus - quickness_penalty
 * - quickness_bonus (characters): (stats.quickness.stat_bonus) * 3 — stat_bonus is racial + special + basic (table from temp)
 * - creature actors: total_db = intrinsic_db + magic + shield_bonus (intrinsic = previous total minus previous
 *   magic/shield from this service); armor_type is updated only when body armor is equipped (manual AT is kept
 *   if there is no body piece, e.g. shield only).
 * - npc actors: total_db = armor_info.natural_db + magic + shield_bonus. natural_db is a hidden
 *   field (not shown on the NPC sheet - see rmss.js's updateActor hook) that stores the GM's own
 *   manually-typed baseline DB, kept in sync whenever they edit the visible total_db field
 *   directly. Without it, equipping armor used to fall through to the character-style formula
 *   (which npc never populates quickness_bonus/adrenal_defense for) and just replaced the
 *   natural DB with the armor bonus instead of adding to it.
 */
export default class ArmorInfoService {

  /**
   * System data from the item document source (not prepared / ActiveEffect-mixed `item.system`).
   * Prevents writing effect-inflated db/at/bonus into actor armor_info; actor effects (e.g. Convenient Effects)
   * would then stack twice on the same bonus.
   * @param {Item|null|undefined} item
   * @returns {object|null}
   */
  static _itemSourceSystem(item) {
    if (!item) return null;
    if (typeof item.toObject === "function") {
      try {
        const sys = item.toObject(true)?.system;
        if (sys) return sys;
      } catch {
        /* ignore */
      }
    }
    return item._source?.system ?? item.system ?? null;
  }

  /**
   * Sets armor_info.quickness_bonus from Quickness stat total bonus × 3 and refreshes total_db.
   * For character actors only; uses current armor_info fields for the other total_db terms.
   * @param {Actor} actor
   */
  static async syncQuicknessArmorBonus(actor) {
    if (actor?.type !== "character" || !actor.system?.armor_info) return;
    actor.prepareData();
    const quickness_bonus = (Number(actor.system.stats?.quickness?.stat_bonus) || 0) * 3;
    const info = actor.system.armor_info;
    const total_db = Math.max(0,
      quickness_bonus +
      (Number(info.adrenal_defense) || 0) +
      (Number(info.magic) || 0) +
      (Number(info.shield_bonus) || 0) -
      (Number(info.quickness_penalty) || 0)
    );
    const prevQb = Number(actor.system.armor_info.quickness_bonus) || 0;
    const prevDb = Number(actor.system.armor_info.total_db) || 0;
    if (prevQb === quickness_bonus && prevDb === total_db) return;
    await actor.update({
      "system.armor_info.quickness_bonus": quickness_bonus,
      "system.armor_info.total_db": total_db
    });
  }

  /**
   * Keep armor_info.natural_db (hidden - see class doc) in sync whenever the GM edits the
   * visible total_db field directly on an npc sheet. Reads the actor's current (already-
   * updated) magic/shield_bonus, so this is idempotent: recomputing right after
   * updateActorArmorInfo's own total_db write (natural_db + magic + shield_bonus) just
   * recovers the same natural_db, no drift either way.
   * @param {Actor} actor
   */
  static async syncNaturalDbFromTotal(actor) {
    if (actor?.type !== "npc" || !actor.system?.armor_info) return;
    const info = actor.system.armor_info;
    const naturalDb = Math.max(0,
      (Number(info.total_db) || 0) - (Number(info.magic) || 0) - (Number(info.shield_bonus) || 0)
    );
    if ((Number(info.natural_db) || 0) === naturalDb) return;
    await actor.update({ "system.armor_info.natural_db": naturalDb });
  }

  /**
   * One-time migration for npc actors that predate the natural_db field: back-fill it from
   * their current total_db/magic/shield_bonus so the next armor equip doesn't wipe out
   * whatever manually-typed baseline DB they already had. Detects "never migrated" via the
   * raw source data (missing key), not the runtime value, since Foundry's schema default (0)
   * is indistinguishable from an intentionally-set 0 at the system.armor_info.natural_db level.
   * @param {Actor} actor
   */
  static async migrateNaturalDbIfMissing(actor) {
    if (actor?.type !== "npc" || !actor.system?.armor_info) return;
    const sourceInfo = actor._source?.system?.armor_info;
    if (!sourceInfo || sourceInfo.natural_db !== undefined) return;
    await this.syncNaturalDbFromTotal(actor);
  }

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
   * Sum material magic bonus from every equipped armor piece (bonus > 0 only).
   * @param {Actor} actor
   * @returns {number}
   */
  static computeEquippedMagicBonus(actor) {
    if (!actor?.items) return 0;
    let magic = 0;
    for (const item of actor.items) {
      if (item.type !== "armor" || !item.system?.equipped) continue;
      const sys = this._itemSourceSystem(item);
      const b = Number(sys?.bonus) || 0;
      if (b > 0) magic += b;
    }
    return magic;
  }

  /**
   * Compute armor_info values from equipped armor items.
   * @param {Actor} actor
   * @returns {{ armor_type: number, shield_bonus: number, magic: number }}
   */
  static computeFromEquipment(actor) {
    const equipped = this.getEquippedArmorBySlot(actor);

    const bodySys = this._itemSourceSystem(equipped.body);
    const shieldSys = this._itemSourceSystem(equipped.shield);
    const armor_type = equipped.body ? (Number(bodySys?.at) || 1) : 1;
    const shield_bonus = equipped.shield ? (Number(shieldSys?.db) || 0) : 0;
    const magic = this.computeEquippedMagicBonus(actor);

    return { armor_type, shield_bonus, magic };
  }

  /**
   * Update actor armor_info from equipped armor. Preserves other armor_info fields.
   * Recalculates total_db.
   * @param {Actor} actor
   */
  static async updateActorArmorInfo(actor) {
    if (!actor?.system?.armor_info) return;

    const equipped = this.getEquippedArmorBySlot(actor);
    const { armor_type, shield_bonus, magic } = this.computeFromEquipment(actor);
    const armorInfo = actor.system.armor_info;

    const prevTotal = Number(armorInfo.total_db) || 0;
    const prevMagic = Number(armorInfo.magic) || 0;
    const prevShield = Number(armorInfo.shield_bonus) || 0;

    const updates = {
      "system.armor_info.shield_bonus": shield_bonus,
      "system.armor_info.magic": magic
    };

    if (actor.type === "creature") {
      const intrinsicDb = prevTotal - prevMagic - prevShield;
      updates["system.armor_info.total_db"] = Math.max(0, intrinsicDb + magic + shield_bonus);
      if (equipped.body) {
        updates["system.armor_info.armor_type"] = armor_type;
      }
    } else if (actor.type === "npc") {
      const naturalDb = Number(armorInfo.natural_db) || 0;
      updates["system.armor_info.total_db"] = Math.max(0, naturalDb + magic + shield_bonus);
      if (equipped.body) {
        updates["system.armor_info.armor_type"] = armor_type;
      }
    } else {
      const quicknessBonus = Number(armorInfo.quickness_bonus) || 0;
      const adrenalDefense = Number(armorInfo.adrenal_defense) || 0;
      const quicknessPenalty = Number(armorInfo.quickness_penalty) || 0;
      updates["system.armor_info.armor_type"] = armor_type;
      updates["system.armor_info.total_db"] = Math.max(0,
        quicknessBonus + adrenalDefense + magic + shield_bonus - quicknessPenalty
      );
    }

    await actor.update(updates);
  }
}
