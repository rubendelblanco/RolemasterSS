/**
 * Service to handle Static Maneuver Table lookups for spell casting.
 */
export default class StaticManeuverService {

    static _tableCache = {};

    /**
     * Load the static maneuver table for the current language.
     */
    static async loadTable() {
        const lang = game.i18n.lang === "es" ? "es" : "en";
        
        if (this._tableCache[lang]) {
            return this._tableCache[lang];
        }
        try {
            const response = await fetch(`systems/rmss/module/spells/tables/${lang}/staticManeuverTable.json`);
            if (!response.ok) {
                throw new Error(`Failed to load staticManeuverTable.json: ${response.statusText}`);
            }
            this._tableCache[lang] = await response.json();
            return this._tableCache[lang];
        } catch (error) {
            console.error("Error loading static maneuver table:", error);
            return null;
        }
    }

    /**
     * Get the result from the static maneuver table.
     * @param {number} total - The total roll result
     * @param {number} naturalRoll - The natural d100 roll (for special results like UM 66, UM 100)
     * @returns {Promise<Object>} The result object with name and description in current language
     */
    static async getResult(total, naturalRoll) {
        const table = await this.loadTable();
        if (!table) return null;

        // Check for special natural roll results first (UM = Unmodified)
        // These trigger on the natural die result, regardless of modifiers
        if (naturalRoll === 66) {
            const special = table.special.um_66;
            return {
                code: special.code,
                name: special.name,
                description: special.description,
                isSpecial: true
            };
        }
        if (naturalRoll === 100) {
            const special = table.special.um_100;
            return {
                code: special.code,
                name: special.name,
                description: special.description,
                isSpecial: true
            };
        }

        // Find the range that matches the total
        for (const range of table.ranges) {
            const minOk = range.min === null || total >= range.min;
            const maxOk = range.max === null || total <= range.max;
            
            if (minOk && maxOk) {
                return {
                    code: range.code,
                    name: range.name,
                    description: range.description,
                    isSpecial: false
                };
            }
        }

        return null;
    }

    /**
     * Get CSS class for result styling based on code.
     */
    static getResultClass(code) {
        const classes = {
            "spectacular_failure": "result-critical-failure",
            "absolute_failure": "result-failure",
            "failure": "result-failure",
            "partial_success": "result-partial",
            "near_success": "result-partial",
            "success": "result-success",
            "absolute_success": "result-critical-success",
            "unusual_event": "result-unusual",
            "unusual_success": "result-critical-success"
        };
        return classes[code] || "";
    }
}
