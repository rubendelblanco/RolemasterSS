import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage, isNpcOrCreatureActor, whisperIdsForNpcRollPrivacy } from "../../chat/chatMessages.js";
import { triggerAutoAnimations, getActorToken } from "../../autoanimations_integration.js";
import { CombatHistoryTracker } from "../../combat/combat_history_tracker.js";
import { getMatchingSpellAdder, consumeSpellAdderUse } from "../../actors/utils/power_points_util.js";

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
    static async castInstantSpell({ actor, spell, consumePowerPoints = true }) {
        if (!spell?.system?.instant) return false;

        const spellLevel = spell.system?.level ?? 1;
        let noPP = !consumePowerPoints || spell.system?.no_pp === true;

        if (!noPP) {
            const spellAdder = getMatchingSpellAdder(actor);
            if (spellAdder) {
                const usesLabel = spellAdder.value > 0 ? ` [${spellAdder.usesRemaining}/${spellAdder.value}]` : "";
                const useIt = await this._askSpellAdder(spellAdder.item.name + usesLabel, spell.name);
                if (useIt) {
                    noPP = true;
                    await consumeSpellAdderUse(spellAdder.item);
                }
            }
        }

        if (!noPP) {
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
        }

        const publicToPlayers = await this._resolveNpcInstantPublicPreference(actor);
        if (publicToPlayers === null) return false;

        if (!noPP) {
            const currentPP = parseInt(actor.system.attributes?.power_points?.current ?? 0);
            const newPP = Math.max(0, currentPP - spellLevel);
            await actor.update({ "system.attributes.power_points.current": newPP });
        }

        await this._createChatMessage({ actor, spell, spellLevel, publicToPlayers });

        const sourceToken = getActorToken(actor);
        if (sourceToken) {
            triggerAutoAnimations(sourceToken, spell, Array.from(game.user.targets));
        }

        // Item macros need the real caster token even when `spell` is a detached/temp Item
        // with no .actor (e.g. cast from a potion enchantment) — see Item._executeItemMacro.
        game.rmss = game.rmss || {};
        game.rmss.lastCasterToken = sourceToken ?? null;

        await spell.use();

        let spellXp = 0;
        if (actor.type === "character") {
            const casterLevel = actor.system.attributes?.level?.value ?? 1;
            const xp = ExperiencePointsCalculator.calculateSpellExpPoints(casterLevel, spellLevel);
            if (xp > 0) {
                spellXp = xp;
                const totalExpActor = parseInt(actor.system.attributes.experience_points.value) + xp;
                await actor.update({ "system.attributes.experience_points.value": totalExpActor });
                const breakDown = { maneuver: 0, spell: xp, critical: 0, kill: 0, bonus: 0, misc: 0 };
                await sendExpMessage(actor, breakDown, xp);
            }
        }

        if (game.combat?.started) {
            CombatHistoryTracker.get().recordSpellCast(actor.id, spellLevel, spellXp);
        }

        return true;
    }

    /**
     * NPC/creature: prompt whether the cast card is visible to players. PC: no prompt (always public).
     * @returns {Promise<boolean|null>} true/false, or null if user closed the dialog without confirming
     */
    static async _resolveNpcInstantPublicPreference(actor) {
        if (!isNpcOrCreatureActor(actor)) return true;
        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.spells.instant_cast"),
                content: `
                    <form class="rmss-instant-visibility-form">
                        <p style="margin-top:0;">${game.i18n.format("rmss.chat.instant_cast_visibility_prompt", { name: actor.name })}</p>
                        <div class="form-group">
                            <label class="flexrow" style="align-items:center; gap:8px;">
                                <input type="checkbox" name="publicRollToPlayers"/>
                                <span>${game.i18n.localize("rmss.chat.public_roll_to_players")}</span>
                            </label>
                            <p class="notes" style="margin:6px 0 0 0; font-size:0.85em;">${game.i18n.localize("rmss.chat.public_roll_to_players_hint")}</p>
                        </div>
                    </form>
                `,
                buttons: {
                    cast: {
                        icon: '<i class="fas fa-magic"></i>',
                        label: game.i18n.localize("rmss.spells.cast"),
                        callback: (html) => {
                            const checked = !!html.find('[name="publicRollToPlayers"]')[0]?.checked;
                            resolve(checked);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("rmss.dialog.cancel"),
                        callback: () => resolve(null)
                    }
                },
                default: "cast",
                close: () => resolve(null)
            }, {
                classes: ["rmss", "casting-options-dialog"],
                width: 420
            }).render(true);
        });
    }

    /**
     * Ask the user whether to use a spell adder for an instant spell.
     * @returns {Promise<boolean>}
     */
    static _askSpellAdder(itemName, spellName) {
        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.format("rmss.spells.cast_with_spell_adder", { itemName }),
                content: `<p>${game.i18n.format("rmss.spells.spell_adder_confirm", { itemName, spellName })}</p>`,
                buttons: {
                    yes: {
                        icon: '<i class="fas fa-hat-wizard"></i>',
                        label: game.i18n.localize("rmss.dialog.yes"),
                        callback: () => resolve(true)
                    },
                    no: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("rmss.dialog.no"),
                        callback: () => resolve(false)
                    }
                },
                default: "yes",
                close: () => resolve(false)
            }, {
                classes: ["rmss", "casting-options-dialog"],
                width: 400
            }).render(true);
        });
    }

    /**
     * Create a chat message for the instant spell cast.
     * @param {Object} params
     * @param {Actor} params.actor - The caster
     * @param {Item} params.spell - The spell
     * @param {number} params.spellLevel - Spell level (PP cost)
     * @param {boolean} [params.publicToPlayers=true]
     */
    static async _createChatMessage({ actor, spell, spellLevel, publicToPlayers = true }) {
        const content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${actor.img}" alt="${actor.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000; display: flex; align-items: center; gap: 6px;">
                            <img src="${spell.img || 'icons/svg/dice-target.svg'}" alt="" width="24" height="24" style="border-radius: 4px; flex-shrink: 0;">
                            ${spell.name}*
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${game.i18n.localize("rmss.spells.instant_cast")}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff;">
                    <div>📊 ${game.i18n.localize("rmss.spell.level")}: <strong>${spellLevel}</strong></div>
                </div>
            </div>
        `;

        const whisper = whisperIdsForNpcRollPrivacy(actor, publicToPlayers);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER,
            ...(whisper ? { whisper } : {})
        });
    }
}
