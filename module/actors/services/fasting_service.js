import { getItemTagsArray } from "../../sheets/items/item_tags_ui.js";
import { whisperIdsForOwnersAndGMs, chatMessageOtherStyle } from "../../chat/chatMessages.js";

/**
 * Ayuno Total (fasting), per the RM rulebook: a character who goes a full day without eating
 * suffers an accumulating -15 penalty to all actions and maneuvers starting the day AFTER the
 * first missed meal — day 1 of fasting = no mechanical penalty yet (just narrative hunger),
 * day 2 = -15, day 3 = -30, day 4 = -45... Eating normal rations again reduces the accumulated
 * penalty by +5 per consecutive day of eating (3 good days to fully shed 1 day's worth of
 * fasting).
 *
 * Tracked per actor via flags.rmss (no calendar in this system — a long rest is the only "a day
 * passed" signal, same convention as FoodSpoilageService/artifact recharge):
 * - ateFoodToday: set by markAteFoodToday() when a "food"-tagged item is consumed, reset to
 *   false by advanceFastingDay() at the end of each day.
 * - missedMealStreak: consecutive days without eating.
 * - fastingPenalty: the current accumulated penalty (always <= 0), mirrored onto a "Penalty"
 *   ActiveEffect so it flows into ManeuverPenaltiesService.getManeuverPenalties() — the same
 *   sum already read by attacks, skill maneuvers and spell casting.
 */
export default class FastingService {
  /**
   * @param {Item|{ system?: object }} itemOrSystem
   * @returns {boolean}
   */
  static itemIsFood(itemOrSystem) {
    const sys = itemOrSystem?.system ?? itemOrSystem;
    return getItemTagsArray(sys).some((t) => t.toLowerCase() === "food");
  }

  /**
   * Call after successfully consuming an item — no-ops unless it's tagged "food".
   * @param {Actor} actor
   * @param {Item} item
   */
  static async markAteFoodToday(actor, item) {
    if (!actor || !this.itemIsFood(item)) return;
    await actor.setFlag("rmss", "ateFoodToday", true);
  }

  /**
   * Pure decision step for one day passing — no document access, easily testable (mirrors
   * FoodSpoilageService.computeNextSpoilageState).
   * @param {boolean} ate - whether the actor ate today
   * @param {number} currentStreak - consecutive days without eating so far
   * @param {number} currentPenalty - current accumulated penalty (<= 0)
   * @returns {{ streak: number, penalty: number, message: "none"|"missed_meal"|"penalty"|"recovering"|"recovered" }}
   */
  static computeNextFastingState(ate, currentStreak, currentPenalty) {
    const prevPenalty = Number(currentPenalty) || 0;

    if (ate) {
      const penalty = Math.min(0, prevPenalty + 5);
      const message = penalty === 0 && prevPenalty < 0 ? "recovered" : penalty < 0 ? "recovering" : "none";
      return { streak: 0, penalty, message };
    }

    const streak = (Number(currentStreak) || 0) + 1;
    const penalty = streak >= 2 ? prevPenalty - 15 : prevPenalty;
    const message = streak === 1 ? "missed_meal" : "penalty";
    return { streak, penalty, message };
  }

  /**
   * Advance one day (one long rest) for one actor: updates the fasting streak/penalty, mirrors
   * it onto the "Penalty" ActiveEffect, resets ateFoodToday for the new day, and posts a chat
   * message when anything actually changed.
   * @param {Actor} actor
   */
  static async advanceFastingDay(actor) {
    if (!actor) return;

    const ate = actor.getFlag("rmss", "ateFoodToday") === true;
    const currentStreak = Number(actor.getFlag("rmss", "missedMealStreak")) || 0;
    const currentPenalty = Number(actor.getFlag("rmss", "fastingPenalty")) || 0;

    const { streak, penalty, message } = this.computeNextFastingState(ate, currentStreak, currentPenalty);

    await actor.setFlag("rmss", "missedMealStreak", streak);
    await actor.setFlag("rmss", "fastingPenalty", penalty);
    await actor.setFlag("rmss", "ateFoodToday", false);
    await this._syncPenaltyEffect(actor, penalty);

    if (message !== "none") await this._chatFastingStatus(actor, message, penalty);
  }

  /**
   * Keeps a single "Penalty" ActiveEffect (flagged flags.rmss.fastingPenalty) in sync with the
   * current penalty value — created/updated/removed as needed, never duplicated.
   * @param {Actor} actor
   * @param {number} penalty
   */
  static async _syncPenaltyEffect(actor, penalty) {
    const existing = actor.effects.find((e) => e.name === "Penalty" && e.flags?.rmss?.fastingPenalty === true);

    if (penalty >= 0) {
      if (existing) await existing.delete();
      return;
    }

    if (existing) {
      if (existing.flags?.rmss?.value !== penalty) await existing.update({ "flags.rmss.value": penalty });
      return;
    }

    await actor.createEmbeddedDocuments("ActiveEffect", [{
      name: "Penalty",
      img: `${CONFIG.rmss.paths.icons_folder}fasting.svg`,
      origin: actor.uuid,
      description: game.i18n.localize("rmss.fasting.effect_description"),
      disabled: false,
      flags: { rmss: { value: penalty, permanentPenalty: true, fastingPenalty: true } },
      duration: { rounds: 99, startRound: game.combat ? game.combat.round : 0 }
    }]);
  }

  /**
   * @param {Actor} actor
   * @param {"missed_meal"|"penalty"|"recovering"|"recovered"} message
   * @param {number} penalty
   */
  static async _chatFastingStatus(actor, message, penalty) {
    const key = {
      missed_meal: "rmss.fasting.missed_meal_message",
      penalty: "rmss.fasting.penalty_message",
      recovering: "rmss.fasting.recovering_message",
      recovered: "rmss.fasting.recovered_message"
    }[message];
    if (!key) return;

    const text = message === "penalty" || message === "recovering"
      ? game.i18n.format(key, { penalty })
      : game.i18n.localize(key);

    const content = `
      <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
        <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 6px;">
          ${actor.img ? `<img src="${actor.img}" style="width: 40px; height: 40px; border-radius: 4px; object-fit: cover;" />` : ""}
          <b style="color: #333;">${actor.name}</b>
        </div>
        <p style="color: #333; margin: 0; font-size: 14px;">${text}</p>
      </div>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      whisper: whisperIdsForOwnersAndGMs(actor),
      ...chatMessageOtherStyle()
    });
  }
}
