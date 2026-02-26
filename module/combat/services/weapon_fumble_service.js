/**
 * Service to handle Weapon Fumble Table lookups (A-10.11.1).
 * Used when melee attack roll is <= weapon's fumble_range.
 */
export default class WeaponFumbleService {

    static _tableCache = {};

    /**
     * Load the weapon fumble table for the current language.
     */
    static async loadTable() {
        const lang = game.i18n.lang === "es" ? "es" : "en";

        if (this._tableCache[lang]) {
            return this._tableCache[lang];
        }
        try {
            const response = await fetch(`systems/rmss/module/combat/tables/${lang}/weaponFumbleTable.json`);
            if (!response.ok) {
                throw new Error(`Failed to load weaponFumbleTable.json: ${response.statusText}`);
            }
            this._tableCache[lang] = await response.json();
            return this._tableCache[lang];
        } catch (error) {
            console.error("Error loading weapon fumble table:", error);
            return null;
        }
    }

    /**
     * Get the effective fumble range. Returns 0 if empty or invalid.
     * @param {string|number} fumbleRange - Raw value from weapon.system.fumble_range
     * @returns {number} Valid fumble range (0 = no fumble possible)
     */
    static getEffectiveFumbleRange(fumbleRange) {
        if (fumbleRange === "" || fumbleRange === null || fumbleRange === undefined) return 0;
        const num = parseInt(fumbleRange, 10);
        return (Number.isNaN(num) || num < 0) ? 0 : num;
    }

    /**
     * Check if a roll triggers a fumble.
     * @param {number} roll - The raw d100 result (first die)
     * @param {string|number} fumbleRange - Raw value from weapon.system.fumble_range
     * @returns {boolean}
     */
    static isFumble(roll, fumbleRange) {
        const effective = this.getEffectiveFumbleRange(fumbleRange);
        if (effective === 0) return false;
        return roll <= effective;
    }

    /**
     * Map weapon type to table column.
     * 1he, 1hc -> 1he; 2h -> 2h; pa -> pa; th -> th; mis -> mis; mounted -> mounted
     * @param {string} weaponType - weapon.system.type
     * @returns {string} Column name for the fumble table
     */
    static getColumnForWeaponType(weaponType) {
        if (!weaponType) return "1he";
        switch (weaponType) {
            case "1he":
            case "1hc":
                return "1he";
            case "2h":
                return "2h";
            case "pa":
                return "pa";
            case "th":
                return "th";
            case "mis":
                return "mis";
            case "mounted":
                return "mounted";
            default:
                return "1he";
        }
    }

    /**
     * Find the fumble result in the table for the given roll and column.
     * @param {Object} table - Loaded fumble table
     * @param {number} roll - d100 roll (1-100)
     * @param {string} column - Column name (1he, 2h, pa, mounted, th, mis)
     * @returns {string|null} Description text
     */
    static _findResult(table, roll, column) {
        if (!table?.ranges) return null;
        for (const range of table.ranges) {
            const minOk = range.min === null || roll >= range.min;
            const maxOk = range.max === null || roll <= range.max;
            if (minOk && maxOk) {
                return range[column] ?? null;
            }
        }
        const firstRange = table.ranges[0];
        return firstRange ? (firstRange[column] ?? null) : null;
    }

    /**
     * Get fumble result for a given roll and weapon.
     * @param {number} roll - Raw d100 roll (first die)
     * @param {string} column - Column name (1he, 2h, pa, mounted, th, mis)
     * @returns {Promise<{description: string, mountedDescription: string|null}>}
     */
    static async getFumbleResult(roll, column) {
        const table = await this.loadTable();
        if (!table) {
            return { description: game.i18n.localize("rmss.combat.fumble_unknown"), mountedDescription: null };
        }

        const description = this._findResult(table, roll, column) ?? game.i18n.localize("rmss.combat.fumble_unknown");
        const mountedDescription = column !== "mounted"
            ? (this._findResult(table, roll, "mounted") ?? null)
            : null;

        return { description, mountedDescription };
    }
}
