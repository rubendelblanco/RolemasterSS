/**
 * Service to handle base spell operations.
 * Manages loading, accessing, and querying base spell data.
 */
export default class BaseSpellService {
    
    static _baseSpellsCache = null;
    
    /**
     * Load base spells data from JSON file.
     * @returns {Promise<Object>} The base spells data
     */
    static async loadBaseSpells() {
        if (this._baseSpellsCache) {
            return this._baseSpellsCache;
        }
        
        try {
            const response = await fetch("systems/rmss/module/spells/tables/baseSpells.json");
            if (!response.ok) {
                throw new Error(`Failed to load baseSpells.json: ${response.statusText}`);
            }
            this._baseSpellsCache = await response.json();
            return this._baseSpellsCache;
        } catch (error) {
            console.error("Error loading base spells:", error);
            ui.notifications.error("Error loading base spells data.");
            throw error;
        }
    }
    
    /**
     * Normalize realm name. Converts "arcane" to "essence".
     * @param {string} realm - The spell realm
     * @returns {string} Normalized realm name
     */
    static normalizeRealm(realm) {
        if (!realm) return "essence";
        const lowerRealm = realm.toLowerCase().trim();
        return lowerRealm === "arcane" ? "essence" : lowerRealm;
    }
    
    /**
     * Get available subindices (options) for a given realm.
     * @param {string} realm - The spell realm ("essence", "channeling", "mentalism", "arcane")
     * @returns {Promise<string[]>} Array of subindex keys
     */
    static async getRealmSubindices(realm) {
        const normalizedRealm = this.normalizeRealm(realm);
        const baseSpells = await this.loadBaseSpells();
        if (!baseSpells[normalizedRealm]) {
            throw new Error(`Realm "${realm}" not found in base spells`);
        }
        return Object.keys(baseSpells[normalizedRealm]);
    }
    
    /**
     * Format subindex name for display (e.g., "metalArmor" -> "Metal Armor").
     * @param {string} subindex - The subindex key
     * @returns {string} Formatted display name
     */
    static formatSubindexName(subindex) {
        return subindex
            .replace(/([A-Z])/g, ' $1')
            .replace(/^./, str => str.toUpperCase())
            .trim();
    }
    
    /**
     * Show dialog to select a subindex from available options.
     * @param {string[]} subindices - Array of subindex keys to choose from
     * @param {string} realmName - The realm name for display (optional)
     * @param {string} targetName - The target name for display (optional)
     * @returns {Promise<string|null>} Selected subindex or null if cancelled
     */
    static async selectSubindex(subindices, realmName = null, targetName = null) {
        return new Promise((resolve) => {
            const buttons = {};
            
            subindices.forEach((subindex) => {
                const displayName = this.formatSubindexName(subindex);
                buttons[subindex] = {
                    label: displayName,
                    callback: () => resolve(subindex)
                };
            });
            
            buttons.cancel = {
                label: game.i18n.localize("rmss.combat.cancel") || "Cancel",
                callback: () => resolve(null)
            };
            
            let title = game.i18n.localize("rmss.spells.select_armor_type") || "Select Armor Type";
            if (targetName) {
                title = `${targetName}: ${title}`;
            }
            if (realmName) {
                title += ` (${realmName})`;
            }
            
            const prompt = game.i18n.localize("rmss.spells.select_armor_type_prompt") || "Select the armor type:";
            const content = targetName 
                ? `<p><strong>${targetName}</strong> - ${prompt}</p>`
                : `<p>${prompt}</p>`;
            
            new Dialog({
                title: title,
                content: content,
                buttons: buttons,
                default: subindices[0]
            }).render(true);
        });
    }
    
    /**
     * Show dialog to select subindices for multiple realms (hybrid spells).
     * @param {string[]} realms - Array of realm names
     * @param {string} targetName - The target name for display (optional)
     * @returns {Promise<Object|null>} Object with realm as key and selected subindex as value, or null if cancelled
     */
    static async selectSubindicesForRealms(realms, targetName = null) {
        const selected = {};
        
        for (const realm of realms) {
            const normalizedRealm = this.normalizeRealm(realm);
            const subindices = await this.getRealmSubindices(normalizedRealm);
            const selectedSubindex = await this.selectSubindex(subindices, normalizedRealm, targetName);
            
            if (!selectedSubindex) {
                return null; // User cancelled
            }
            
            selected[normalizedRealm] = selectedSubindex;
        }
        
        return selected;
    }
    
    /**
     * Compare two spell results and return the WORST one (for hybrid realms).
     * Rules: "F" (Fumble) is always the worst result.
     * If both are numeric, return the LOWER value (worse for the caster).
     * @param {number|string} result1 - First result
     * @param {number|string} result2 - Second result
     * @returns {number|string} The worst result
     */
    static compareSpellResults(result1, result2) {
        // If either result is "F", return "F" (worst possible)
        if (result1 === "F" || result2 === "F") {
            return "F";
        }
        
        // Both are numeric, return the LOWER value (worse for caster)
        const num1 = typeof result1 === "number" ? result1 : parseFloat(result1);
        const num2 = typeof result2 === "number" ? result2 : parseFloat(result2);
        
        return Math.min(num1, num2);
    }
    
    /**
     * Check if a natural roll result is in an unmodified range.
     * Unmodified ranges: 01-02 and 96-100
     * Modified range: 03-95
     * @param {number} naturalRoll - The natural roll result (1-100)
     * @returns {boolean} True if the roll is in an unmodified range
     */
    static isUnmodifiedRoll(naturalRoll) {
        // Unmodified ranges: 01-02 and 96-100
        return naturalRoll <= 2 || naturalRoll >= 96;
    }
    
    /**
     * Normalize spell roll result according to unmodified roll rules.
     * - If naturalRoll is in unmodified ranges (100, 98-99, 96-97, 01-02), 
     *   return it without modification.
     * - Otherwise, apply modifier and limit to 3-95 range.
     * 
     * @param {number} naturalRoll - The natural roll result (1-100)
     * @param {number} modifier - The modifier to apply (can be negative)
     * @returns {number} The normalized result to look up in the table
     */
    static normalizeSpellRollResult(naturalRoll, modifier) {
        // Check if roll is unmodified
        if (this.isUnmodifiedRoll(naturalRoll)) {
            // Unmodified rolls use the natural result directly
            return naturalRoll;
        }
        
        // Apply modifier to non-unmodified rolls
        const modifiedResult = naturalRoll + modifier;
        
        // Limit to valid range for modified rolls (3-95)
        // Note: 96-100 are reserved for unmodified natural rolls
        return Math.max(3, Math.min(95, modifiedResult));
    }
    
    /**
     * Find the value in a subindex table based on a roll result.
     * Handles ranges (e.g., "98-99", "01-02") and exact values (e.g., "100").
     * @param {Object} subindexTable - The subindex table object
     * @param {number} rollResult - The roll result (normalized to 1-100)
     * @returns {number|string|null} The value from the table or null if not found
     */
    static findValueInSubindex(subindexTable, rollResult) {
        // Try exact match first (check both with and without leading zeros)
        const exactKey = rollResult.toString();
        const exactKeyWithZero = rollResult < 10 ? `0${rollResult}` : exactKey;
        
        if (subindexTable[exactKey] !== undefined) {
            return subindexTable[exactKey];
        }
        if (subindexTable[exactKeyWithZero] !== undefined) {
            return subindexTable[exactKeyWithZero];
        }
        
        // Try range matches (e.g., "98-99", "01-02")
        // Note: Keys might have leading zeros like "01-02" or "09-12"
        for (const key in subindexTable) {
            if (key.includes("-")) {
                const parts = key.split("-").map(s => s.trim());
                const min = parseInt(parts[0], 10);
                const max = parseInt(parts[1], 10);
                
                if (rollResult >= min && rollResult <= max) {
                    return subindexTable[key];
                }
            }
        }
        
        return null;
    }
    
    /**
     * Get base spell result by realm(s), natural roll, modifier, and selected subindex(es).
     * Supports single realm or hybrid realms (array of 2 realms).
     * 
     * @param {Object} params - Parameters
     * @param {string|string[]} params.realm - The spell realm(s): single realm string or array of 2 realms for hybrids
     *                                          Valid values: "essence", "channeling", "mentalism", "arcane"
     *                                          Hybrid examples: ["essence", "channeling"], ["channeling", "mentalism"]
     * @param {number} params.naturalRoll - The natural roll result (1-100)
     * @param {number} params.modifier - The modifier to apply (can be negative)
     * @param {string|Object} params.subindex - For single realm: subindex string (optional, will prompt if not provided)
     *                                          For hybrid realms: Object with realm as key and subindex as value (optional, will prompt if not provided)
     * @param {string} params.targetName - The target name for display in dialogs (optional)
     * @returns {Promise<number|string|null>} The result from the table(s) or null
     */
    static async getBaseSpellResult({ realm, naturalRoll, modifier, subindex = null, targetName = null }) {
        // Normalize roll result according to unmodified roll rules
        const normalizedResult = this.normalizeSpellRollResult(naturalRoll, modifier);
        
        // Handle single realm vs hybrid realms
        const realms = Array.isArray(realm) ? realm : [realm];
        
        // Validate: hybrid can only have 2 realms
        if (realms.length > 2) {
            ui.notifications.error("Hybrid spells can only combine 2 realms");
            return null;
        }
        
        // Normalize all realms (arcane -> essence)
        const normalizedRealms = realms.map(r => this.normalizeRealm(r));
        
        // Load base spells data
        const baseSpells = await this.loadBaseSpells();
        
        // Validate all realms exist
        for (const normalizedRealm of normalizedRealms) {
            if (!baseSpells[normalizedRealm]) {
                ui.notifications.error(`Realm "${normalizedRealm}" not found in base spells`);
                return null;
            }
        }
        
        // Handle subindex selection
        let selectedSubindices = {};
        
        if (realms.length === 1) {
            // Single realm
            const normalizedRealm = normalizedRealms[0];
            const realmData = baseSpells[normalizedRealm];
            
            if (subindex === null || typeof subindex === "string") {
                // Prompt for subindex if not provided
                if (!subindex) {
                    const subindices = Object.keys(realmData);
                    subindex = await this.selectSubindex(subindices, normalizedRealm, targetName);
                    if (!subindex) return null;
                }
                selectedSubindices[normalizedRealm] = subindex;
            } else {
                // subindex is an object (shouldn't happen for single realm, but handle it)
                selectedSubindices[normalizedRealm] = subindex[normalizedRealm] || Object.keys(realmData)[0];
            }
        } else {
            // Hybrid realms (2 realms)
            if (subindex === null || typeof subindex === "object") {
                // Prompt for both subindices if not provided or incomplete
                if (!subindex || Object.keys(subindex).length !== 2) {
                    selectedSubindices = await this.selectSubindicesForRealms(normalizedRealms, targetName);
                    if (!selectedSubindices) return null;
                } else {
                    selectedSubindices = subindex;
                }
            } else {
                // Invalid: subindex should be object for hybrid realms
                ui.notifications.error("For hybrid realms, subindex must be an object");
                return null;
            }
        }
        
        // Get results from all realms
        const results = [];
        
        for (const normalizedRealm of normalizedRealms) {
            const realmData = baseSpells[normalizedRealm];
            const selectedSubindex = selectedSubindices[normalizedRealm];
            
            if (!realmData[selectedSubindex]) {
                ui.notifications.error(`Subindex "${selectedSubindex}" not found for realm "${normalizedRealm}"`);
                return null;
            }
            
            const subindexTable = realmData[selectedSubindex];
            const result = this.findValueInSubindex(subindexTable, normalizedResult);
            results.push(result);
        }
        
        // For single realm, return the result directly
        if (results.length === 1) {
            return {
                result: results[0],
                subindices: selectedSubindices
            };
        }
        
        // For hybrid realms, compare results (F takes precedence, otherwise lowest value = worst)
        return {
            result: this.compareSpellResults(results[0], results[1]),
            subindices: selectedSubindices
        };
    }
}

