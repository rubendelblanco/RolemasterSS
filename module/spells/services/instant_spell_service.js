import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage } from "../../chat/chatMessages.js";

/**
 * Service for casting instant spells.
 * Instant spells succeed immediately: no maneuver roll, no failure.
 * Executes macro (if any), spends PP, awards XP.
 */
export default class InstantSpellService {

    /**
     * Cast an instant spell. No maneuver roll - immediate success.
     * @param {Object} params
     * @param {Actor} params.actor - The caster
     * @param {Item} params.spell - The spell (must have system.instant === true)
     * @returns {Promise<boolean>} True if cast successfully
     */
    static async castInstantSpell({ actor, spell }) {
        if (!spell?.system?.instant) return false;

        const spellLevel = spell.system?.level ?? 1;
        const currentPP = parseInt(actor.system.attributes?.power_points?.current ?? 0);
        if (currentPP < spellLevel) {
            ui.notifications.warn(
                game.i18n.format("rmss.spells.insufficient_power", {
                    actorName: actor.name,
                    spellName: spell.name
                })
            );
            return false;
        }

        const newPP = Math.max(0, currentPP - spellLevel);
        await actor.update({ "system.attributes.power_points.current": newPP });

        await this._createChatMessage({ actor, spell, spellLevel });

        await spell.use();

        if (actor.type === "character") {
            const casterLevel = actor.system.attributes?.level?.value ?? 1;
            const xp = ExperiencePointsCalculator.calculateSpellExpPoints(casterLevel, spellLevel);
            if (xp > 0) {
                const totalExpActor = parseInt(actor.system.attributes.experience_points.value) + xp;
                await actor.update({ "system.attributes.experience_points.value": totalExpActor });
                const breakDown = { maneuver: 0, spell: xp, critical: 0, kill: 0, bonus: 0, misc: 0 };
                await sendExpMessage(actor, breakDown, xp);
            }
        }

        return true;
    }

    /**
     * Create a chat message for the instant spell cast.
     * @param {Object} params
     * @param {Actor} params.actor - The caster
     * @param {Item} params.spell - The spell
     * @param {number} params.spellLevel - Spell level (PP cost)
     */
    static async _createChatMessage({ actor, spell, spellLevel }) {
        const content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${actor.img}" alt="${actor.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000;">
                            ⚡ ${spell.name}*
                        </h4>
                        <div style="font-size: 0.9em; color: #ccc;">
                            ${game.i18n.localize("rmss.spells.instant_cast")}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #ddd;">
                    <div>📊 ${game.i18n.localize("rmss.spell.level")}: <strong>${spellLevel}</strong></div>
                </div>
            </div>
        `;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
    }
}
