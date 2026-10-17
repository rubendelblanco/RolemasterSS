/**
 * Service to compute and update actor armor_info from equipped armor items.
 * - armor_type (AT): from equipped body armor only
 * - shield_bonus: from equipped shield system.db (defensive bonus)
 * - magic: sum of material bonuses (system.bonus > 0) from all equipped armor (body, helmet, shield)
 * - total_db: recalculated from quickness_bonus + adrenal_defense + magic + shield_bonus, where the armor's
 *   quickness_penalty only ever takes off quickness_bonus, which can't drop below 0 (see computeCharacterTotalDb)
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
import { getArmorPenalties } from "../../core/armor/armor_penalty_service.js";

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
  /**
   * A character's total DB. The armor's Quickness penalty reduces the Quickness bonus and nothing else, and that
   * bonus never goes below zero: the penalty cannot eat into the adrenal, magic or shield parts of the DB.
   * @param {{ quicknessBonus?: number, quicknessPenalty?: number, adrenalDefense?: number, magic?: number, shieldBonus?: number }} parts
   * @returns {number} never negative
   */
  static computeCharacterTotalDb({ quicknessBonus = 0, quicknessPenalty = 0, adrenalDefense = 0, magic = 0, shieldBonus = 0 } = {}) {
    const num = (v) => Number(v) || 0;
    const effectiveQuickness = Math.max(0, num(quicknessBonus) - num(quicknessPenalty));
    return Math.max(0, effectiveQuickness + num(adrenalDefense) + num(magic) + num(shieldBonus));
  }

  /**
   * What the Active Effects on the actor add (mode ADD) to one data path. Read from the effects themselves, so
   * the answer is the same however many times the actor's data has been prepared (a prepared value that has
   * had the effects applied twice would not be).
   * @param {Actor} actor
   * @param {string} key e.g. "system.armor_info.magic"
   * @returns {number}
   */
  static sumEffectAdds(actor, key) {
    let sum = 0;
    for (const effect of actor?.effects ?? []) {
      if (effect.disabled || effect.isSuppressed) continue;
      for (const change of effect.changes ?? []) {
        if (change.key !== key) continue;
        if (change.mode === 2 || change.type === "add") sum += Number(change.value) || 0;
      }
    }
    return sum;
  }

  /**
   * A character's total DB worked out from what is STORED on the actor (adrenal defense, magic, shield) and the
   * armor's penalties, never from prepared values that effects have already been applied to. What gets written
   * to the actor is the plain figure (withEffects false), so it can't feed back into itself: writing the prepared,
   * effect-inflated figure made every save add the effect again. The live figure (withEffects true) is the plain
   * one plus what the actor's effects add to the magic bonus and to the DB.
   * @param {Actor} actor
   * @param {{ withEffects?: boolean, quicknessBonus?: number, adrenalDefense?: number, magic?: number }} [options]
   *   adrenalDefense / magic stand in for the stored value (a field that has just been typed on the sheet)
   * @returns {number}
   */
  static computeCharacterDb(actor, { withEffects = false, quicknessBonus, adrenalDefense, magic } = {}) {
    const stored = actor?._source?.system?.armor_info ?? {};
    const num = (v) => Number(v) || 0;
    const quickness = quicknessBonus ?? num(actor?.system?.stats?.quickness?.stat_bonus) * 3;
    const { quicknessPenalty } = getArmorPenalties(actor);
    const effectMagic = withEffects ? this.sumEffectAdds(actor, "system.armor_info.magic") : 0;
    const db = this.computeCharacterTotalDb({
      quicknessBonus: quickness,
      quicknessPenalty,
      adrenalDefense: adrenalDefense ?? stored.adrenal_defense,
      magic: num(magic ?? stored.magic) + effectMagic,
      shieldBonus: stored.shield_bonus
    });
    return withEffects ? db + this.sumEffectAdds(actor, "system.armor_info.total_db") : db;
  }

  static async syncQuicknessArmorBonus(actor) {
    if (actor?.type !== "character" || !actor.system?.armor_info) return;
    // The actor has just been updated, so its data is already prepared: preparing it again would apply its
    // Active Effects a second time
    const quickness_bonus = (Number(actor.system.stats?.quickness?.stat_bonus) || 0) * 3;
    const total_db = this.computeCharacterDb(actor, { quicknessBonus: quickness_bonus });
    const stored = actor._source?.system?.armor_info ?? {};
    if ((Number(stored.quickness_bonus) || 0) === quickness_bonus && (Number(stored.total_db) || 0) === total_db) return;
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
      let quicknessPenalty = Number(armorInfo.quickness_penalty) || 0;
      // With a body armor on, its penalties (Armor Table T-3.3 for its penalty AT, or the armor's own values) are
      // the ones that count; without one, whatever is typed on the sheet stays.
      if (equipped.body) {
        const penalties = getArmorPenalties(actor);
        quicknessPenalty = penalties.quicknessPenalty;
        updates["system.armor_info.quickness_penalty"] = penalties.quicknessPenalty;
        updates["system.armor_info.missile_penalty"] = penalties.missilePenalty;
      }
      updates["system.armor_info.armor_type"] = armor_type;
      updates["system.armor_info.total_db"] = this.computeCharacterTotalDb({
        quicknessBonus, quicknessPenalty, adrenalDefense, magic, shieldBonus: shield_bonus
      });
    }

    await actor.update(updates);
  }
}
