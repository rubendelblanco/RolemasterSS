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
     * @returns {Promise<Object|null>} The result based on which tab action was taken
     */
    static async showPopup(token, criticalOptions = {}) {
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
                }
            }).render(true);
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

        // RR calculation on input change. The target number from the table is invariant (levels
        // only) - the modifier is applied to the defender's roll, not to this target, so it plays
        // no part in the displayed target here (see executeResistanceRoll).
        const updateRRDisplay = () => {
            const attackerLevel = parseInt(html.find("#rr-attacker-level").val()) || 1;
            const defenderLevel = parseInt(html.find("#rr-defender-level").val()) || 1;
            const rrTarget = ResistanceRollService.calculateBaseRR(attackerLevel, defenderLevel);
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
     * Create a chat message prompting for the RR roll.
     * The button is only visible to the token owner and GM.
     * @param {Token} token - The target token
     * @param {number} attackerLevel - Level of the attacker
     * @param {number} defenderLevel - Level of the defender
     * @param {number} modifier - Modifier added to the defender's roll (not to the target - the
     *   table target is invariant, only levels change it; see executeResistanceRoll)
     */
    static async createRRPromptMessage(token, attackerLevel, defenderLevel, modifier) {
        const rrTarget = ResistanceRollService.calculateBaseRR(attackerLevel, defenderLevel);
        const actor = token.actor;
        
        // Get owners of the token (player IDs)
        const ownerIds = Object.entries(actor.ownership || {})
            .filter(([id, level]) => level >= CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER && id !== "default")
            .map(([id]) => id);

        const content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${token.actor.img}" alt="${token.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000;">
                            🛡️ ${game.i18n.localize("rmss.combat.resistance_roll")}
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${token.name} ${game.i18n.localize("rmss.combat.must_roll_rr")}
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
                    data-token-id="${token.id}"
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
            speaker: ChatMessage.getSpeaker({ token: token.document }),
            content: content,
            ...chatMessageOtherStyle()
        });

        return { rrTarget };
    }

    /**
     * Perform the actual resistance roll (called when button is clicked).
     * @param {string} tokenId - The token ID
     * @param {number} attackerLevel - Level of the attacker
     * @param {number} defenderLevel - Level of the defender
     * @param {number} modifier - Modifier to add to the roll
     * @param {number} rrTarget - Pre-calculated RR target
     * @param {{ postChatMessage?: boolean }} [options] - postChatMessage (default true): post the
     *   individual per-roll result card. Set false when the caller posts its own grouped summary
     *   instead (e.g. an area-effect macro rolling RR for several targets at once).
     */
    static async executeResistanceRoll(tokenId, attackerLevel, defenderLevel, modifier, rrTarget, { postChatMessage = true } = {}) {
        const token = canvas.tokens.get(tokenId);
        if (!token) {
            ui.notifications.error("Token not found");
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

        // Apply modifier to roll
        const finalRoll = rollTotal + modifier;

        // Determine success
        const success = finalRoll >= rrTarget;

        // Create result chat message
        if (postChatMessage) {
            await this._createRRResultMessage({
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

        let content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${token.actor.img}" alt="${token.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000;">
                            🛡️ ${game.i18n.localize("rmss.combat.resistance_roll")}
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${token.name}
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
                    <div>📈 Total: <strong>${finalRoll}</strong></div>
                </div>
                <div style="margin-top: 8px; padding: 8px; border-radius: 6px; text-align: center; background: ${resultBg}; border: 2px solid ${resultColor};">
                    <span style="font-size: 1.2em; font-weight: bold; color: #fff; text-shadow: 0 0 4px ${resultColor}, 0 0 8px ${resultColor};">${resultEmoji} ${resultText}</span>
                </div>
            </div>
        `;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ token: token.document }),
            content: content,
            ...chatMessageOtherStyle()
        });
    }
}
