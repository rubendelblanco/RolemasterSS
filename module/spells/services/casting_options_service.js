/**
 * Service to handle spell casting options dialog and modifier calculations.
 */
import ManeuverPenaltiesService from "../../core/maneuver_penalties_service.js";
import EquipmentService from "../../actors/services/equipment_service.js";

export default class CastingOptionsService {

    static _modifiersCache = null;

    /**
     * Load the spell casting modifiers table.
     */
    static async loadModifiers() {
        if (this._modifiersCache) {
            return this._modifiersCache;
        }
        try {
            const response = await fetch("systems/rmss/module/spells/tables/spellCastingModifiers.json");
            if (!response.ok) {
                throw new Error(`Failed to load spellCastingModifiers.json: ${response.statusText}`);
            }
            this._modifiersCache = await response.json();
            return this._modifiersCache;
        } catch (error) {
            console.error("Error loading spell casting modifiers:", error);
            return null;
        }
    }

    /**
     * Show the casting options dialog and return the total modifier.
     * @param {Object} params
     * @param {string} params.realm - The spell's realm (essence, channeling, mentalism, or hybrid)
     * @param {string} params.spellType - The spell type (E, BE, DE, F, P, U, I)
     * @param {string} params.spellName - The spell name for display
     * @param {Actor} [params.actor] - The caster (required for BE: hits taken penalty)
     * @param {string} [params.spellAdderItemName] - Name of the equipped spell adder item (if available)
     * @param {number} [params.spellAdderUsesRemaining] - Daily uses remaining for the spell adder
     * @param {number} [params.spellAdderUsesMax] - Total daily uses for the spell adder
     * @param {number} [params.spellLevel=1] - PP cost; compared to current PP when spendPp is true
     * @param {boolean} [params.spendPp=true] - If true, "Cast" is hidden when current PP &lt; spellLevel (use Spell Adder or close)
     * @returns {Promise<{totalModifier: number, options: Object, useSpellAdder?: boolean}|null>}
     */
    static async showCastingOptionsDialog({
        realm,
        spellType,
        spellName,
        actor = null,
        spellAdderItemName = null,
        spellAdderUsesRemaining = 0,
        spellAdderUsesMax = 0,
        spellLevel = 1,
        spendPp = true
    }) {
        const modifiers = await this.loadModifiers();
        if (!modifiers) {
            ui.notifications.error("Failed to load casting modifiers");
            return null;
        }

        const normalizedRealm = this._normalizeRealm(realm);
        const autoPenalties = (actor != null)
            ? ManeuverPenaltiesService.getManeuverPenalties(actor, { spellType: spellType })
            : { hitsTaken: 0, bleeding: 0, stunned: 0, penaltyEffect: 0, activeBonus: 0 };
        const showAutoPenalties = actor != null;
        const handsOccupied = (actor != null) ? EquipmentService.getHandsOccupiedForCasting(actor) : 0;
        const spellTypeUpper = String(spellType ?? "").toUpperCase();
        const showPublicRollCheckbox =
            actor != null
            && (actor.type === "npc" || actor.type === "creature")
            && !["BE", "DE"].includes(spellTypeUpper);
        const level = Math.max(0, parseInt(String(spellLevel), 10) || 0);
        const currentPP = actor
            ? (parseInt(actor.system?.attributes?.power_points?.current ?? 0, 10) || 0)
            : Number.POSITIVE_INFINITY;
        const insufficientPp = spendPp && actor && currentPP < level;
        const content = this._buildDialogContent(
            normalizedRealm,
            spellType,
            modifiers,
            autoPenalties,
            showAutoPenalties,
            handsOccupied,
            showPublicRollCheckbox,
            insufficientPp
        );

        const buttons = {};
        if (!insufficientPp) {
            buttons.cast = {
                icon: '<i class="fas fa-magic"></i>',
                label: game.i18n.localize("rmss.spells.cast"),
                callback: (html) => {
                    const result = this._calculateModifiers(html, normalizedRealm, spellType, modifiers, autoPenalties, showPublicRollCheckbox);
                    resolve(result);
                }
            };
        }
        if (spellAdderItemName) {
            const usesLabel = spellAdderUsesMax > 0 ? ` [${spellAdderUsesRemaining}/${spellAdderUsesMax}]` : "";
            buttons.spellAdder = {
                icon: '<i class="fas fa-hat-wizard"></i>',
                label: game.i18n.format("rmss.spells.cast_with_spell_adder", { itemName: spellAdderItemName }) + usesLabel,
                callback: (html) => {
                    const result = this._calculateModifiers(html, normalizedRealm, spellType, modifiers, autoPenalties, showPublicRollCheckbox);
                    result.useSpellAdder = true;
                    resolve(result);
                }
            };
        }
        if (insufficientPp && !spellAdderItemName) {
            buttons.closeOnly = {
                icon: '<i class="fas fa-times"></i>',
                label: game.i18n.localize("rmss.dialog.cancel"),
                callback: () => resolve(null)
            };
        }

        let defaultButton = "cast";
        if (insufficientPp) {
            defaultButton = spellAdderItemName ? "spellAdder" : "closeOnly";
        }

        let resolve;
        return new Promise((res) => {
            resolve = res;
            new Dialog({
                title: game.i18n.localize("rmss.spells.casting_options"),
                content: content,
                buttons,
                default: defaultButton,
                close: () => resolve(null)
            }, {
                classes: ["rmss", "casting-options-dialog"],
                width: 400
            }).render(true);
        });
    }

    /**
     * Build the HTML content for the casting options dialog.
     * @param {number} [handsOccupied] - Actor's occupied hands (0-2) for pre-selecting hands option
     */
    static _buildDialogContent(realm, spellType, modifiers, autoPenalties = {}, showAutoPenalties = false, handsOccupied = 0, showPublicRollCheckbox = false, insufficientPpForNormalCast = false) {
        const subtletyPenalty = this._getSubtletyPenalty(realm, spellType, modifiers);
        const handsModifiers = this._getHandsModifiers(realm, modifiers);
        const voiceModifiers = this._getVoiceModifiers(realm, modifiers);
        const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);
        const { hitsTaken = 0, bleeding = 0, stunned = 0, penaltyEffect = 0, activeBonus = 0 } = autoPenalties;
        const penaltyDisplay = Math.min(0, penaltyEffect);
        const autoPenaltiesBlock = showAutoPenalties ? `
                <div class="form-group" style="font-size:0.9em; color:#555;">
                    <div>${game.i18n.localize("rmss.combat.hits_taken")}: ${fmt(hitsTaken)}</div>
                    <div>${game.i18n.localize("rmss.maneuvers.bleeding")}: ${fmt(bleeding)}</div>
                    <div>${game.i18n.localize("rmss.maneuvers.stunned")}: ${fmt(stunned)}</div>
                    ${penaltyEffect !== 0 ? `<div>${game.i18n.localize("rmss.combat.penalty")}: ${fmt(penaltyDisplay)}</div>` : ""}
                    ${activeBonus !== 0 ? `<div>${game.i18n.localize("rmss.maneuvers.active_effect_bonus")}: ${fmt(activeBonus)}</div>` : ""}
                </div>
` : "";
        const handsHintBlock = showAutoPenalties ? `
                <div class="form-group" style="font-size:0.9em; color:#555;">
                    <div>${game.i18n.format("rmss.spells.hands_occupied", { current: handsOccupied, max: 2 })}</div>
                </div>
` : "";
        const defaultHands = handsOccupied >= 2 ? "none" : (handsOccupied === 1 ? "one" : "two");
        const handsTwoSelected = defaultHands === "two" ? " selected" : "";
        const handsOneSelected = defaultHands === "one" ? " selected" : "";
        const handsNoneSelected = defaultHands === "none" ? " selected" : "";

        const insufficientPpHtml = insufficientPpForNormalCast
            ? `
                <div class="form-group rmss-casting-insufficient-pp" style="padding:8px 10px; margin-bottom:6px; background:rgba(200, 65, 15, 0.18); border:1px solid #c2410c; color:#9a3412; border-radius:5px; font-size:0.95em; font-weight:600; line-height:1.35;">
                    ${game.i18n.localize("rmss.spells.casting_options_insufficient_pp")}
                </div>
`
            : "";

        return `
            <form class="casting-options-form">
                ${insufficientPpHtml}
                ${autoPenaltiesBlock}
                ${handsHintBlock}
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.spells.subtlety")}</label>
                    <select name="subtlety">
                        <option value="normal" selected>Normal (+0)</option>
                        <option value="subtle">Subtle (${subtletyPenalty})</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.spells.hands")}</label>
                    <select name="hands">
                        <option value="two"${handsTwoSelected}>Two Hands (${this._formatModifier(handsModifiers.two)})</option>
                        <option value="one"${handsOneSelected}>One Hand (${this._formatModifier(handsModifiers.one)})</option>
                        <option value="none"${handsNoneSelected}>No Hands (${this._formatModifier(handsModifiers.none)})</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.spells.voice")}</label>
                    <select name="voice">
                        <option value="shout">Shout (${this._formatModifier(voiceModifiers.shout)})</option>
                        <option value="normal" selected>Normal (+0)</option>
                        <option value="whisper">Whisper (${this._formatModifier(voiceModifiers.whisper)})</option>
                        <option value="none">Silent (${this._formatModifier(voiceModifiers.none)})</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.spells.preparation")}</label>
                    <select name="preparation">
                        <option value="0" selected>No Extra Prep (+0)</option>
                        <option value="1">1 Round (+10)</option>
                        <option value="2">2 Rounds (+20)</option>
                    </select>
                </div>
                
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.spells.other_mods")}</label>
                    <input type="number" name="otherMods" value="0" style="width: 80px;"/>
                </div>
                
                ${showPublicRollCheckbox ? `
                <div class="form-group" style="margin-top:8px;">
                    <label class="flexrow" style="align-items:center; gap:8px;">
                        <input type="checkbox" name="publicRollToPlayers"/>
                        <span>${game.i18n.localize("rmss.chat.public_roll_to_players")}</span>
                    </label>
                    <p class="notes" style="margin:4px 0 0 0; font-size:0.85em;">${game.i18n.localize("rmss.chat.public_roll_to_players_hint")}</p>
                </div>
                ` : ""}
                
                <hr/>
                <div class="form-group total-modifier">
                    <label><strong>${game.i18n.localize("rmss.spells.total_modifier")}:</strong></label>
                    <span id="casting-total-modifier"><strong>+0</strong></span>
                </div>
            </form>
            
            <script>
                (function() {
                    const form = document.querySelector('.casting-options-form');
                    const updateTotal = () => {
                        const subtlety = form.querySelector('[name="subtlety"]').value;
                        const hands = form.querySelector('[name="hands"]').value;
                        const voice = form.querySelector('[name="voice"]').value;
                        const prep = form.querySelector('[name="preparation"]').value;
                        const otherMods = parseInt(form.querySelector('[name="otherMods"]').value) || 0;
                        
                        const subtletyMod = subtlety === 'subtle' ? ${subtletyPenalty} : 0;
                        const handsMod = ${JSON.stringify(handsModifiers)}[hands];
                        const voiceMod = ${JSON.stringify(voiceModifiers)}[voice];
                        const prepMod = [0, 10, 20][parseInt(prep)];
                        const hitsTakenMod = ${hitsTaken};
                        const bleedingMod = ${bleeding};
                        const stunnedMod = ${stunned};
                        const penaltyEffectMod = Math.min(0, ${penaltyEffect});
                        const activeBonusMod = ${activeBonus};
                        
                        const total = subtletyMod + handsMod + voiceMod + prepMod + otherMods + hitsTakenMod + bleedingMod + stunnedMod + penaltyEffectMod + activeBonusMod;
                        const sign = total >= 0 ? '+' : '';
                        document.getElementById('casting-total-modifier').innerHTML = '<strong>' + sign + total + '</strong>';
                    };
                    
                    form.querySelectorAll('select, input').forEach(el => el.addEventListener('change', updateTotal));
                    form.querySelector('[name="otherMods"]').addEventListener('input', updateTotal);
                    updateTotal();
                })();
            </script>
        `;
    }

    /**
     * Calculate the total modifier from the dialog selections.
     */
    static _calculateModifiers(html, realm, spellType, modifiers, autoPenalties = {}, showPublicRollCheckbox = false) {
        const form = html.find('form')[0];
        const formData = new FormData(form);
        
        const subtlety = formData.get('subtlety');
        const hands = formData.get('hands');
        const voice = formData.get('voice');
        const preparation = formData.get('preparation');
        const otherMods = parseInt(formData.get('otherMods')) || 0;

        const subtletyMod = subtlety === 'subtle' ? this._getSubtletyPenalty(realm, spellType, modifiers) : 0;
        const handsMod = this._getHandsModifiers(realm, modifiers)[hands];
        const voiceMod = this._getVoiceModifiers(realm, modifiers)[voice];
        const prepMod = modifiers.preparation[preparation];

        const castingModifier = subtletyMod + handsMod + voiceMod + prepMod + otherMods;
        const autoPenaltyTotal = ManeuverPenaltiesService.getTotalAutoPenalty(autoPenalties);
        const totalModifier = castingModifier + autoPenaltyTotal;

        const publicRollToPlayers = !showPublicRollCheckbox || !!form?.querySelector('[name="publicRollToPlayers"]')?.checked;

        return {
            totalModifier,
            castingModifier,
            publicRollToPlayers,
            ...autoPenalties,
            options: {
                subtlety,
                hands,
                voice,
                preparation: parseInt(preparation),
                otherMods
            }
        };
    }

    /**
     * Get the subtlety penalty for a spell type and realm.
     */
    static _getSubtletyPenalty(realm, spellType, modifiers) {
        const typeModifiers = modifiers.subtlety[spellType];
        if (!typeModifiers) return 0;
        return typeModifiers[realm] ?? typeModifiers["essence"] ?? 0;
    }

    /**
     * Get the hands modifiers for a realm.
     */
    static _getHandsModifiers(realm, modifiers) {
        const hands = modifiers.hands;
        return {
            none: hands.none[realm] ?? hands.none["essence"] ?? 0,
            one: hands.one[realm] ?? hands.one["essence"] ?? 0,
            two: hands.two[realm] ?? hands.two["essence"] ?? 0
        };
    }

    /**
     * Get the voice modifiers for a realm.
     */
    static _getVoiceModifiers(realm, modifiers) {
        const voice = modifiers.voice;
        return {
            none: voice.none[realm] ?? voice.none["essence"] ?? 0,
            whisper: voice.whisper[realm] ?? voice.whisper["essence"] ?? 0,
            normal: voice.normal[realm] ?? voice.normal["essence"] ?? 0,
            shout: voice.shout[realm] ?? voice.shout["essence"] ?? 0
        };
    }

    /**
     * Format a modifier number with sign.
     */
    static _formatModifier(num) {
        if (num >= 0) return `+${num}`;
        return `${num}`;
    }

    /**
     * Normalize realm string, handling hybrids and arcane.
     */
    static _normalizeRealm(realm) {
        if (!realm) return "essence";
        const lower = realm.toLowerCase().trim();
        if (lower === "arcane") return "essence";
        return lower;
    }
}
