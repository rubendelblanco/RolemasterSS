/**
 * Service to handle Spell Failure Table lookups (A-10.11.2).
 * Used when spell casting maneuver results in failure (≤25).
 */
export default class SpellFailureService {

    static _tableCache = {};

    /**
     * Load the spell failure table for the current language.
     */
    static async loadTable() {
        const lang = game.i18n.lang === "es" ? "es" : "en";
        
        if (this._tableCache[lang]) {
            return this._tableCache[lang];
        }
        try {
            const response = await fetch(`systems/rmss/module/spells/tables/${lang}/spellFailureTable.json`);
            if (!response.ok) {
                throw new Error(`Failed to load spellFailureTable.json: ${response.statusText}`);
            }
            this._tableCache[lang] = await response.json();
            return this._tableCache[lang];
        } catch (error) {
            console.error("Error loading spell failure table:", error);
            return null;
        }
    }

    /**
     * Determine which column to use based on spell type.
     * Attack spells: DE, BE (elemental attacks), F (force)
     * Non-attack spells: I (informational), E, P, U, and others (other)
     * @param {string} spellType - The spell type (E, BE, DE, F, P, U, I)
     * @returns {string} The column name in the failure table
     */
    static getColumnForSpellType(spellType) {
        switch (spellType) {
            case "BE":
            case "DE":
                return "elemental";
            case "F":
                return "force";
            case "I":
                return "informational";
            default:
                // E, P, U and any other type are non-attack spells
                return "other";
        }
    }

    /**
     * Get the multiplier for casting modifiers based on failure severity.
     * @param {string} failureCode - The failure code from static maneuver table
     * @returns {number} Multiplier (1, 2, or 3)
     */
    static getModifierMultiplier(failureCode) {
        switch (failureCode) {
            case "spectacular_failure":
                return 3;
            case "absolute_failure":
                return 2;
            case "failure":
            default:
                return 1;
        }
    }

    /**
     * Roll on the spell failure table.
     * @param {string} spellType - The spell type (E, BE, DE, F, P, U, I)
     * @param {string} failureCode - The failure code from static maneuver (spectacular_failure, absolute_failure, failure)
     * @param {number} castingModifiers - The total negative modifiers from the casting options modal
     * @returns {Promise<Object>} Result with roll, final value, and failure description
     */
    static async rollFailure(spellType, failureCode, castingModifiers) {
        const table = await this.loadTable();
        if (!table) return null;

        // Roll explosive d100 (open-ended upward)
        const roll = new Roll("1d100x>95");
        await roll.evaluate();

        // Show dice if Dice So Nice is available
        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
        }

        // Calculate modifier impact
        const multiplier = this.getModifierMultiplier(failureCode);
        // castingModifiers is typically negative, subtracting it makes result higher (worse)
        const modifierPenalty = -castingModifiers * multiplier;
        const finalResult = roll.total + modifierPenalty;

        // Get the column for this spell type
        const column = this.getColumnForSpellType(spellType);

        // Find the matching range
        const result = this._findResult(table, finalResult, column);

        return {
            naturalRoll: roll.total,
            multiplier: multiplier,
            modifierPenalty: modifierPenalty,
            finalResult: finalResult,
            column: column,
            description: result ?? game.i18n.localize("rmss.spells.failure_unknown")
        };
    }

    /**
     * Find the result in the table for the given value and column.
     * Values below the table minimum use the first range (best failure outcome).
     * @private
     */
    static _findResult(table, value, column) {
        for (const range of table.ranges) {
            const minOk = range.min === null || value >= range.min;
            const maxOk = range.max === null || value <= range.max;
            
            if (minOk && maxOk) {
                return range[column] ?? null;
            }
        }
        // Result below table range (e.g. negative from heavy casting bonuses): use first range
        const firstRange = table.ranges[0];
        return firstRange ? (firstRange[column] ?? null) : null;
    }

    /**
     * Check if a maneuver result code indicates a failure that requires rolling on spell failure table.
     * @param {string} code - The result code from static maneuver table
     * @returns {boolean}
     */
    static isFailureResult(code) {
        return ["spectacular_failure", "absolute_failure", "failure"].includes(code);
    }
}
