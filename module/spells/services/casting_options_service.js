/**
 * Service to handle spell casting options dialog and modifier calculations.
 */
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
     * @returns {Promise<{totalModifier: number, options: Object}|null>} The total modifier and selected options, or null if cancelled
     */
    static async showCastingOptionsDialog({ realm, spellType, spellName }) {
        const modifiers = await this.loadModifiers();
        if (!modifiers) {
            ui.notifications.error("Failed to load casting modifiers");
            return null;
        }

        const normalizedRealm = this._normalizeRealm(realm);
        const content = this._buildDialogContent(normalizedRealm, spellType, modifiers);
        
        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.spells.casting_options"),
                content: content,
                buttons: {
                    cast: {
                        icon: '<i class="fas fa-magic"></i>',
                        label: game.i18n.localize("rmss.spells.cast"),
                        callback: (html) => {
                            const result = this._calculateModifiers(html, normalizedRealm, spellType, modifiers);
                            resolve(result);
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
                width: 400
            }).render(true);
        });
    }

    /**
     * Build the HTML content for the casting options dialog.
     */
    static _buildDialogContent(realm, spellType, modifiers) {
        const subtletyPenalty = this._getSubtletyPenalty(realm, spellType, modifiers);
        const handsModifiers = this._getHandsModifiers(realm, modifiers);
        const voiceModifiers = this._getVoiceModifiers(realm, modifiers);

        return `
            <form class="casting-options-form">
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
                        <option value="two" selected>Two Hands (${this._formatModifier(handsModifiers.two)})</option>
                        <option value="one">One Hand (${this._formatModifier(handsModifiers.one)})</option>
                        <option value="none">No Hands (${this._formatModifier(handsModifiers.none)})</option>
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
                        
                        const total = subtletyMod + handsMod + voiceMod + prepMod + otherMods;
                        const sign = total >= 0 ? '+' : '';
                        document.getElementById('casting-total-modifier').innerHTML = '<strong>' + sign + total + '</strong>';
                    };
                    
                    form.querySelectorAll('select, input').forEach(el => el.addEventListener('change', updateTotal));
                    form.querySelector('[name="otherMods"]').addEventListener('input', updateTotal);
                })();
            </script>
        `;
    }

    /**
     * Calculate the total modifier from the dialog selections.
     */
    static _calculateModifiers(html, realm, spellType, modifiers) {
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

        const totalModifier = subtletyMod + handsMod + voiceMod + prepMod + otherMods;

        return {
            totalModifier,
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
