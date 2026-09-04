import { getEffectivePowerPointsMaxForSheet } from "../utils/power_points_util.js";
import { whisperIdsForOwnersAndGMs } from "../../chat/chatMessages.js";

/**
 * Long rest recovery. Extracted from RMSSPlayerSheet (was a private sheet instance method) so
 * it can be triggered from outside the sheet (e.g. the Argon Combat HUD's Rest panel) without
 * reaching into private sheet internals.
 */
export default class RestService {

  /**
   * Stat bonus of the actor's primary realm stat (empathy/intuition/presence, or an average for
   * dual/arcane realms), used for both PP recovery and the recover_pp_per_* sheet fields.
   * @param {Actor} actor
   * @returns {number}
   */
  static getPowerPointRecoveryBaseBonus(actor) {
    const realm = actor.system.fixed_info?.realm || "";
    const stats = actor.system.stats || {};

    const empathyBonus = Number(stats.empathy?.stat_bonus) || 0;
    const intuitionBonus = Number(stats.intuition?.stat_bonus) || 0;
    const presenceBonus = Number(stats.presence?.stat_bonus) || 0;

    switch (realm) {
      case "essence":
        return empathyBonus;
      case "channeling":
        return intuitionBonus;
      case "mentalism":
        return presenceBonus;
      case "essence/channeling":
        return Math.ceil((empathyBonus + intuitionBonus) / 2);
      case "essence/mentalism":
        return Math.ceil((empathyBonus + presenceBonus) / 2);
      case "channeling/mentalism":
        return Math.ceil((intuitionBonus + presenceBonus) / 2);
      case "arcane":
        return Math.ceil((intuitionBonus + presenceBonus + empathyBonus) / 3);
      default:
        return 0;
    }
  }

  /**
   * Apply HP/PP recovery from a long rest, reset enchantments/spell adder via the rmssLongRest
   * hook, and post a chat summary whispered to owners + GMs.
   * @param {Actor} actor
   * @param {number} hours
   * @returns {Promise<{ hpRecovered: number, ppRecovered: number }>}
   */
  static async performLongRest(actor, hours) {
    actor.prepareData();

    const intervals = Math.max(0, Math.floor(Number(hours) / 3));
    const conStatBonus = Number(actor.system.stats?.constitution?.stat_bonus) || 0;
    const realmStatBonus = this.getPowerPointRecoveryBaseBonus(actor);

    const hits = actor.system.attributes?.hits || {};
    const hitsMax = Number(hits.max) || 0;
    const hitsCurrent = Number(hits.current) || 0;
    const hpRoom = Math.max(0, hitsMax - hitsCurrent);
    const hpRecovered = Math.min(hpRoom, conStatBonus * 2 * intervals);

    const pp = actor.system.attributes?.power_points || {};
    const ppCurrent = Number(pp.current) || 0;
    const ppMax = getEffectivePowerPointsMaxForSheet(actor);
    const ppRoom = Math.max(0, ppMax - ppCurrent);
    const ppRecovered = Math.min(ppRoom, realmStatBonus * 2 * intervals);

    await actor.update({
      "system.attributes.hits.current": hitsCurrent + hpRecovered,
      "system.attributes.power_points.current": ppCurrent + ppRecovered
    });

    const hookReturns = Hooks.callAll("rmssLongRest", actor);
    await Promise.all((hookReturns ?? []).filter((r) => r && typeof r.then === "function"));

    const whispers = whisperIdsForOwnersAndGMs(actor);

    const hoursNum = Math.max(0, Math.floor(Number(hours)) || 0);
    const hoursUnitKey = hoursNum === 1 ? "rmss.long_rest.hour_unit" : "rmss.long_rest.hours_unit";
    const hoursUnit = game.i18n.localize(hoursUnitKey);
    const nameSafe = typeof foundry.utils?.escapeHTML === "function"
      ? foundry.utils.escapeHTML(actor.name)
      : actor.name;
    const summaryLine = game.i18n.format("rmss.long_rest.chat_message", {
      name: nameSafe,
      hours: hoursNum,
      hoursUnit
    });
    const imgSrc = actor.img;
    const portraitHtml = imgSrc
      ? `<img src="${imgSrc}" alt="" width="40" height="40" style="border-radius: 6px; border: 1px solid #333; object-fit: cover; flex-shrink: 0;" />`
      : "";
    const content = `<p class="rmss-long-rest-chat" style="display: flex; align-items: center; gap: 0.5rem; flex-wrap: wrap; margin: 0 0 0.35em 0;">${portraitHtml}<span>${summaryLine}</span></p>
            <p>${game.i18n.localize("rmss.long_rest.hits_recovered")}: ${hpRecovered}</p>
            <p>${game.i18n.localize("rmss.long_rest.pp_recovered")}: ${ppRecovered}</p>`;

    await ChatMessage.create({
      speaker: ChatMessage.getSpeaker({ actor }),
      content,
      whisper: whispers
    });

    return { hpRecovered, ppRecovered };
  }
}
