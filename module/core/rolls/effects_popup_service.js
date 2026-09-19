import ResistanceRollService from "./resistance_roll_service.js";
import { rmss } from "../../config.js";
import { chatMessageOtherStyle } from "../../chat/chatMessages.js";

/** Keys of Actor#system.resistance_rolls (character sheet only — npc/creature don't have this template). */
const RESISTANCE_ROLL_KEYS = [
    "channeling", "essence", "mentalism", "chann_ess", "chann_ment", "ess_ment",
    "arcane", "poison", "disease", "fear"
];

/**
 * Service to handle the RMSS Effects popup with tabs for Critical and Resistance Roll.
 */
export default class EffectsPopupService {

    /**
     * Show the effects popup for a token.
     * @param {Token} token - The target token
     * @param {Object} criticalOptions - Options for the critical tab
     * @param {string|null} [preselectedResistanceKey] - One of RESISTANCE_ROLL_KEYS. When given,
     *   the Resistance Roll tab's category select starts on this option (instead of "custom"),
     *   with the modifier auto-filled the same way picking it by hand would. Used by the
     *   character sheet's per-row dice icon, so clicking "Fear"'s icon opens straight into a
     *   Fear roll instead of a blank custom one.
     * @returns {Promise<Object|null>} The result based on which tab action was taken
     */
    static async showPopup(token, criticalOptions = {}, preselectedResistanceKey = null) {
        const actor = token.actor;
        if (!actor) return null;

        const defenderLevel = actor.system?.attributes?.level?.value ?? 1;

        const pcCombatants = (game.combat?.combatants ?? [])
            .filter(c => c.actor?.type === "character")
            .map(c => ({ id: c.actor.id, name: c.actor.name }));

        const resistanceOptions = RESISTANCE_ROLL_KEYS.map((key) => ({
            key,
            label: game.i18n.localize(`rmss.pc_sheet_resistances.${key}`),
            total: actor.system?.resistance_rolls?.[key]?.total ?? 0
        }));

        const context = {
            token: token.document,
            isGM: game.user.isGM,
            actorImg: actor.img,
            defenderLevel: defenderLevel,
            damage: criticalOptions.damage ?? 0,
            severity: criticalOptions.severity ?? 'A',
            critType: criticalOptions.critType ?? 'K',
            critDict: CONFIG.rmss.criticalDictionary,
            subcritdict: CONFIG.rmss.criticalSubtypes,
            critModifier: criticalOptions.modifier ?? 0,
            criticalHasSubtypes: (rmss.large_critical_types[criticalOptions.critType ?? 'K'] || []).length > 0,
            pcCombatants,
            resistanceOptions
        };

        const htmlContent = await renderTemplate(
            "systems/rmss/templates/combat/rmss-effects-popup.hbs",
            context
        );

        return new Promise((resolve) => {
            let activeTab = "resistance";
            
            new Dialog({
                title: game.i18n.localize("rmss.combat.effects_title"),
                content: htmlContent,
                buttons: {
                    confirm: {
                        label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
                        callback: async (html) => {
                            if (activeTab === "critical") {
                                const damage = parseInt(html.find("#damage").val());
                                const severity = html.find("#severity").val();
                                const critType = html.find("#critical-type").val();
                                const subCritType = html.find("#critical-subtype").val();
                                const modifier = html.find("#modifier").val();
                                const attackerId = html.find("#critical-attacker").val() || null;
                                resolve({ 
                                    action: "critical",
                                    confirmed: true, 
                                    damage, 
                                    severity, 
                                    critType, 
                                    subCritType, 
                                    modifier,
                                    attackerId
                                });
                            } else if (activeTab === "resistance") {
                                const attackerLevel = parseInt(html.find("#rr-attacker-level").val()) || 1;
                                const defenderLevel = parseInt(html.find("#rr-defender-level").val()) || 1;
                                const modifier = parseInt(html.find("#rr-modifier").val()) || 0;
                                
                                // Create prompt message instead of rolling directly
                                const result = await this.createRRPromptMessage(
                                    token, 
                                    attackerLevel, 
                                    defenderLevel, 
                                    modifier
                                );
                                resolve({ action: "rr", ...result });
                            }
                        }
                    },
                    cancel: {
                        label: `❌ ${game.i18n.localize("rmss.combat.cancel")}`,
                        callback: () => resolve(null)
                    }
                },
                default: "cancel",
                render: (html) => {
                    this._setupEventListeners(html, (tab) => { activeTab = tab; });
                    if (preselectedResistanceKey) {
                        html.find("#rr-modifier-select").val(preselectedResistanceKey).trigger("change");
                    }
                }
            }).render(true);
        });
    }

    /**
     * Show a standalone Resistance Roll dialog for an actor — no token required. Meant for
     * entry points that only have an actor to work with (e.g. the character sheet's per-row
     * dice icon), where the actor may not even have a token placed on the current scene.
     * Same fields/behavior as the Resistance Roll tab in showPopup, just without the tabs
     * wrapper or the GM-only Critical tab.
     * @param {Actor} actor
     * @param {string|null} [preselectedResistanceKey] - One of RESISTANCE_ROLL_KEYS, preselected
     *   in the category dropdown instead of "custom".
     * @returns {Promise<Object|null>}
     */
    static async showResistanceOnlyPopup(actor, preselectedResistanceKey = null) {
        if (!actor) return null;

        const defenderLevel = actor.system?.attributes?.level?.value ?? 1;
        const resistanceOptions = RESISTANCE_ROLL_KEYS.map((key) => ({
            key,
            label: game.i18n.localize(`rmss.pc_sheet_resistances.${key}`),
            total: actor.system?.resistance_rolls?.[key]?.total ?? 0
        }));

        const htmlContent = await renderTemplate(
            "systems/rmss/templates/combat/rmss-resistance-only-popup.hbs",
            { actorImg: actor.img, actorName: actor.name, defenderLevel, resistanceOptions }
        );

        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.resistance_roll"),
                content: htmlContent,
                buttons: {
                    confirm: {
                        label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
                        callback: async (html) => {
                            const attackerLevel = parseInt(html.find("#rr-attacker-level").val()) || 1;
                            const defenderLevel = parseInt(html.find("#rr-defender-level").val()) || 1;
                            const modifier = parseInt(html.find("#rr-modifier").val()) || 0;
                            const result = await this.createRRPromptMessageForActor(actor, attackerLevel, defenderLevel, modifier);
                            resolve({ action: "rr", ...result });
                        }
                    },
                    cancel: {
                        label: `❌ ${game.i18n.localize("rmss.combat.cancel")}`,
                        callback: () => resolve(null)
                    }
                },
                default: "cancel",
                render: (html) => {
                    this._setupResistanceEventListeners(html);
                    if (preselectedResistanceKey) {
                        html.find("#rr-modifier-select").val(preselectedResistanceKey).trigger("change");
                    }
                }
            }, { classes: ["rmss", "casting-options-dialog"], width: 420 }).render(true);
        });
    }

    /**
     * Setup event listeners for the popup.
     * @private
     * @param {jQuery} html - The dialog HTML
     * @param {Function} onTabChange - Callback when tab changes
     */
    static _setupEventListeners(html, onTabChange) {
        // Tab switching
        html.find(".rmss-tab").on("click", (event) => {
            const tabId = event.currentTarget.dataset.tab;
            
            // Update tab buttons
            html.find(".rmss-tab").removeClass("active");
            event.currentTarget.classList.add("active");
            
            // Update tab content
            html.find(".rmss-tab-content").removeClass("active");
            html.find(`.rmss-tab-content[data-tab="${tabId}"]`).addClass("active");
            
            // Notify parent of tab change
            if (onTabChange) onTabChange(tabId);
        });

        // Critical damage multiplier
        html.find("#damage-mult").on("change", (event) => {
            const mult = parseInt(event.target.value);
            const base = parseInt(html.find("#damage-base").val());
            html.find("#damage").val(mult * base);
        });

        // Critical type change (show/hide subtypes)
        html.find("#critical-type").on("change", (event) => {
            const tableName = event.target.value;
            const criticalSubtypes = rmss.large_critical_types[tableName] || [];
            if (criticalSubtypes.length > 0) {
                html.find("#critical-subtype").empty();
                criticalSubtypes.forEach((subtype) => {
                    html.find("#critical-subtype").append(`<option value="${subtype}">${subtype}</option>`);
                });
                html.find("#critical-subtype-container").show();
            } else {
                html.find("#critical-subtype-container").hide();
            }
        });

        // Positive number enforcement
        html.find(".is-positive").on("change", (event) => {
            event.target.value = Math.abs(parseInt(event.target.value) || 0);
        });

        this._setupResistanceEventListeners(html);
    }

    /**
     * Wires the Resistance Roll fields (attacker/defender level, modifier select/input, live
     * target display) - shared by the tabbed showPopup and the standalone
     * showResistanceOnlyPopup, since both render the same field markup.
     * @private
     * @param {jQuery} html
     */
    static _setupResistanceEventListeners(html) {
        // RR calculation on input change. Uses the same getFinalRR the spell-casting RR flow
        // uses - the modifier reduces the target directly (e.g. base 50, +20 resistance ->
        // target 30), so what's displayed here matches what a player already sees when resisting
        // a spell, instead of silently folding the modifier into the roll comparison and never
        // showing the number they actually need to beat.
        const updateRRDisplay = () => {
            const attackerLevel = parseInt(html.find("#rr-attacker-level").val()) || 1;
            const defenderLevel = parseInt(html.find("#rr-defender-level").val()) || 1;
            const modifier = parseInt(html.find("#rr-modifier").val()) || 0;
            const rrTarget = ResistanceRollService.getFinalRR(attackerLevel, defenderLevel, modifier);
            html.find("#rr-target-display").text(rrTarget);
        };

        html.find("#rr-attacker-level, #rr-defender-level, #rr-modifier").on("input", updateRRDisplay);

        // Resistance category select: "custom" leaves the modifier free to type; any other
        // option locks it to that category's actual total from the character sheet.
        html.find("#rr-modifier-select").on("change", (event) => {
            const modifierInput = html.find("#rr-modifier");
            const isCustom = event.target.value === "custom";
            modifierInput.prop("disabled", !isCustom);
            if (!isCustom) {
                const total = parseInt(event.target.selectedOptions[0]?.dataset.value, 10) || 0;
                modifierInput.val(total);
            }
            updateRRDisplay();
        });

        // Initial calculation
        updateRRDisplay();
    }

    /**
     * Create a chat message prompting for the RR roll, from a token (existing token-bound flow -
     * token HUD's Effects popup, spell-casting auto-RR).
     * The button is only visible to the token owner and GM.
     * @param {Token} token - The target token
     * @param {number} attackerLevel - Level of the attacker
     * @param {number} defenderLevel - Level of the defender
     * @param {number} modifier - Resistance modifier; reduces the target directly via
     *   getFinalRR (same convention the spell-casting RR flow uses), not added to the roll.
     */
    static async createRRPromptMessage(token, attackerLevel, defenderLevel, modifier) {
        return this._postRRPromptMessage({ actor: token.actor, token, attackerLevel, defenderLevel, modifier });
    }

    /**
     * Create a chat message prompting for the RR roll, from an actor with no token involved
     * (character sheet's per-row dice icon - the actor may not have a token on the current
     * scene at all). Same card/button, just without a token to speak/display as.
     * @param {Actor} actor
     * @param {number} attackerLevel
     * @param {number} defenderLevel
     * @param {number} modifier
     */
    static async createRRPromptMessageForActor(actor, attackerLevel, defenderLevel, modifier) {
        return this._postRRPromptMessage({ actor, token: null, attackerLevel, defenderLevel, modifier });
    }

    /**
     * Shared by createRRPromptMessage/createRRPromptMessageForActor - builds and posts the "you
     * must resist" prompt card. Always keys the roll button to the actor (data-actor-id) so it
     * still works if the token is gone by the time someone clicks it; data-token-id is only set
     * when a token was actually involved, for the nicer token-speaker chat card.
     * @private
     */
    static async _postRRPromptMessage({ actor, token, attackerLevel, defenderLevel, modifier }) {
        const rrTarget = ResistanceRollService.getFinalRR(attackerLevel, defenderLevel, modifier);

        // Owners of the actor (player IDs) - actor-based regardless of whether a token exists.
        const ownerIds = Object.entries(actor.ownership || {})
            .filter(([id, level]) => level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && id !== "default")
            .map(([id]) => id);

        const displayName = token?.name ?? actor.name;
        const displayImg = token?.actor?.img ?? actor.img;

        const content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${displayImg}" alt="${displayName}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000;">
                            🛡️ ${game.i18n.localize("rmss.combat.resistance_roll")}
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${displayName} ${game.i18n.localize("rmss.combat.must_roll_rr")}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff; margin-bottom: 8px;">
                    <div>⚔️ ${game.i18n.localize("rmss.combat.attacker_level")}: <strong>${attackerLevel}</strong></div>
                    <div>🛡️ ${game.i18n.localize("rmss.combat.defender_level")}: <strong>${defenderLevel}</strong></div>
                    ${modifier !== 0 ? `<div>📊 ${game.i18n.localize("rmss.combat.rr_modifier")}: <strong>${modifier >= 0 ? '+' : ''}${modifier}</strong></div>` : ''}
                    <div>🎯 ${game.i18n.localize("rmss.combat.rr_target")}: <strong style="color: #ffd700;">${rrTarget}</strong></div>
                </div>
                <button class="rr-roll-button"
                    data-actor-id="${actor.id}"
                    data-token-id="${token?.id ?? ''}"
                    data-attacker-level="${attackerLevel}"
                    data-defender-level="${defenderLevel}"
                    data-modifier="${modifier}"
                    data-rr-target="${rrTarget}"
                    data-owner-ids="${ownerIds.join(',')}">
                    🎲 ${game.i18n.localize("rmss.combat.roll_rr")}
                </button>
            </div>
        `;

        await ChatMessage.create({
            speaker: token ? ChatMessage.getSpeaker({ token: token.document }) : ChatMessage.getSpeaker({ actor }),
            content: content,
            ...chatMessageOtherStyle()
        });

        return { rrTarget };
    }

    /**
     * Perform the actual resistance roll (called when button is clicked).
     * @param {string|null} tokenId - The token ID, if a token was involved (empty/null otherwise)
     * @param {number} attackerLevel - Level of the attacker
     * @param {number} defenderLevel - Level of the defender
     * @param {number} modifier - Resistance modifier, informational only here - it's already
     *   baked into rrTarget (via getFinalRR), so it must NOT be added to the roll again.
     * @param {number} rrTarget - Pre-calculated final RR target (already modifier-adjusted)
     * @param {{ postChatMessage?: boolean, actorId?: string|null }} [options] - postChatMessage
     *   (default true): post the individual per-roll result card. Set false when the caller posts
     *   its own grouped summary instead (e.g. an area-effect macro rolling RR for several targets
     *   at once). actorId: fallback when there's no live token (or it's since been removed from
     *   the scene) - resolves the roll against the actor directly.
     */
    static async executeResistanceRoll(tokenId, attackerLevel, defenderLevel, modifier, rrTarget, { postChatMessage = true, actorId = null } = {}) {
        const token = tokenId ? canvas.tokens.get(tokenId) : null;
        const actor = token?.actor ?? (actorId ? game.actors.get(actorId) : null);
        if (!actor) {
            ui.notifications.error("Token/actor not found");
            return;
        }

        // Roll explosive d100
        const roll = await new Roll("1d100x>95").evaluate();
        const naturalRoll = roll.dice[0].results[0].result;
        const rollTotal = roll.total;

        // Show dice animation
        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
        }

        // rrTarget already has the modifier folded in (getFinalRR) - do not add it again here.
        const finalRoll = rollTotal;

        // Determine success
        const success = finalRoll >= rrTarget;

        // Create result chat message
        if (postChatMessage) {
            await this._createRRResultMessage({
                actor,
                token,
                attackerLevel,
                defenderLevel,
                rrTarget,
                naturalRoll,
                rollTotal,
                modifier,
                finalRoll,
                success
            });
        }

        return { success, finalRoll, naturalRoll, rollTotal };
    }

    /**
     * Create chat message for RR result.
     * @private
     */
    static async _createRRResultMessage({
        actor,
        token,
        attackerLevel,
        defenderLevel,
        rrTarget,
        naturalRoll,
        rollTotal,
        modifier,
        finalRoll,
        success
    }) {
        const isExplosive = rollTotal !== naturalRoll;
        const resultEmoji = success ? "😎" : "😬";
        const resultText = success
            ? game.i18n.localize("rmss.combat.rr_success")
            : game.i18n.localize("rmss.combat.rr_failed");
        const resultColor = success ? "#4a4" : "#c44";
        const resultBg = success ? "rgba(34, 139, 34, 0.3)" : "rgba(204, 0, 0, 0.3)";
        const displayName = token?.name ?? actor.name;
        const displayImg = token?.actor?.img ?? actor.img;

        let content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${displayImg}" alt="${displayName}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000;">
                            🛡️ ${game.i18n.localize("rmss.combat.resistance_roll")}
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${displayName}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff; margin-bottom: 8px;">
                    <div>⚔️ ${game.i18n.localize("rmss.combat.attacker_level")}: <strong>${attackerLevel}</strong></div>
                    <div>🛡️ ${game.i18n.localize("rmss.combat.defender_level")}: <strong>${defenderLevel}</strong></div>
                    <div>🎯 ${game.i18n.localize("rmss.combat.rr_target")}: <strong style="color: #ffd700;">${rrTarget}</strong></div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff;">
                    <div>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${naturalRoll}</strong>${isExplosive ? ` → <strong style="color: orange;">${rollTotal}</strong> 💥` : ''}</div>
                    ${modifier !== 0 ? `<div>📊 ${game.i18n.localize("rmss.combat.rr_modifier")}: <strong>${modifier >= 0 ? '+' : ''}${modifier}</strong></div>` : ''}
                </div>
                <div style="margin-top: 8px; padding: 8px; border-radius: 6px; text-align: center; background: ${resultBg}; border: 2px solid ${resultColor};">
                    <span style="font-size: 1.2em; font-weight: bold; color: #fff; text-shadow: 0 0 4px ${resultColor}, 0 0 8px ${resultColor};">${resultEmoji} ${resultText}</span>
                </div>
            </div>
        `;

        await ChatMessage.create({
            speaker: token ? ChatMessage.getSpeaker({ token: token.document }) : ChatMessage.getSpeaker({ actor }),
            content: content,
            ...chatMessageOtherStyle()
        });
    }
}
