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
     * Get available subindices (options) for a given realm.
     * @param {string} realm - The spell realm ("essence", "channeling", "mentalism")
     * @returns {Promise<string[]>} Array of subindex keys
     */
    static async getRealmSubindices(realm) {
        const baseSpells = await this.loadBaseSpells();
        if (!baseSpells[realm]) {
            throw new Error(`Realm "${realm}" not found in base spells`);
        }
        return Object.keys(baseSpells[realm]);
    }
    
    /**
     * Show dialog to select a subindex from available options.
     * @param {string[]} subindices - Array of subindex keys to choose from
     * @returns {Promise<string|null>} Selected subindex or null if cancelled
     */
    static async selectSubindex(subindices) {
        return new Promise((resolve) => {
            const buttons = {};
            
            subindices.forEach((subindex) => {
                // Format subindex name for display (e.g., "metalArmor" -> "Metal Armor")
                const displayName = subindex
                    .replace(/([A-Z])/g, ' $1')
                    .replace(/^./, str => str.toUpperCase())
                    .trim();
                
                buttons[subindex] = {
                    label: displayName,
                    callback: () => resolve(subindex)
                };
            });
            
            buttons.cancel = {
                label: game.i18n.localize("rmss.combat.cancel") || "Cancel",
                callback: () => resolve(null)
            };
            
            new Dialog({
                title: game.i18n.localize("rmss.spells.select_armor_type") || "Select Armor Type",
                content: `<p>${game.i18n.localize("rmss.spells.select_armor_type_prompt") || "Select the armor type:"}</p>`,
                buttons: buttons,
                default: subindices[0]
            }).render(true);
        });
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
     * Get base spell result by realm, roll result, and selected subindex.
     * @param {Object} params - Parameters
     * @param {string} params.realm - The spell realm ("essence", "channeling", "mentalism")
     * @param {number} params.rollResult - The roll result (can be negative or >100)
     * @param {string} params.subindex - The selected subindex (optional, will prompt if not provided)
     * @returns {Promise<number|string|null>} The result from the table or null
     */
    static async getBaseSpellResult({ realm, rollResult, subindex = null }) {
        // Normalize roll result: clamp between 1 and 100
        const normalizedResult = Math.max(1, Math.min(100, rollResult));
        
        // Load base spells data
        const baseSpells = await this.loadBaseSpells();
        
        if (!baseSpells[realm]) {
            ui.notifications.error(`Realm "${realm}" not found in base spells`);
            return null;
        }
        
        const realmData = baseSpells[realm];
        
        // Get subindex (prompt if not provided)
        if (!subindex) {
            const subindices = Object.keys(realmData);
            subindex = await this.selectSubindex(subindices);
            
            if (!subindex) {
                return null; // User cancelled
            }
        }
        
        if (!realmData[subindex]) {
            ui.notifications.error(`Subindex "${subindex}" not found for realm "${realm}"`);
            return null;
        }
        
        const subindexTable = realmData[subindex];
        const result = this.findValueInSubindex(subindexTable, normalizedResult);
        
        return result;
    }
}

