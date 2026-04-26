import {socket} from "../../rmss.js";
import { withPublicRollMode } from "../chat/chatMessages.js";

const findAttackTableRow = (tableName, attackTable, result) => {
    const numResult = parseInt(result, 10);
    for (const element of attackTable.rows) {
        const range = element.Result.split("-");
        const isRange = range.length > 1;

        if (isRange) {
            const lowerBound = parseInt(range[0], 10);
            const upperBound = parseInt(range[1], 10);

            if (numResult >= lowerBound && numResult <= upperBound) {
                return element;
            }

        } else if (numResult === parseInt(range[0], 10)) {
            return element;
        }
    }
    throw new Error(`No matching row found in attack table ${tableName} for result ${result}`);
}

export default class RMSSTableManager {
    static findUnmodifiedAttack (tableName, baseAttack, attackTable) {
        let umResult  = null;
        const um = attackTable.um || [];
        for (const rangeStr of um) {
            const range = rangeStr.split("-").map(Number);
            const lower = range[0];
            const upper = range[1];

            if (baseAttack >= lower && baseAttack <= upper) {
                umResult = {
                    id: rangeStr,
                    lower: lower,
                    upper: upper,
                    attack: baseAttack
                }
                break;
            }
        }
        if (!umResult) {
            return null;
        }

        umResult.row =  findAttackTableRow(tableName, attackTable, baseAttack);
        return umResult;
    }

    static findAttackTableRow(tableName, attackTable, result) {
        return findAttackTableRow(tableName, attackTable, result);
    }

    static async loadAttackTable(tableName) {
        const path = `systems/rmss/module/combat/tables/arms/${tableName}.json`;

        try {
            const response = await fetch(path);

            if (!response.ok) {
                throw new Error(`Failed to load JSON: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Error loading JSON file:", error);
        }
    }

    static async getAttackTableMaxResult(weapon) {
        const attackTable = await RMSSTableManager.loadAttackTable(weapon.system.attack_table);
        let maximum = 1;

        for (const element of attackTable.rows) {
            const range = element.Result.split("-");
            const isRange = range.length > 1;

            if (isRange) {
                const lowerBound = parseInt(range[0], 10);
                const upperBound = parseInt(range[1], 10);
                const limit = Math.max(lowerBound, upperBound);
                if (limit > maximum) {
                    maximum = limit;
                }
            } else  {
                const value = parseInt(range[0], 10);
                if (value > maximum) {
                    maximum = value;
                }
            }
        }

        return maximum;
    }

    static async getAttackTableResult(weapon, attackTable, totalAttack, enemy, attacker, armorTypeOverride = null){
        const armorInfo = enemy.system.armor_info ?? {};
        const storedAt = armorInfo.armor_type ?? armorInfo.armor_info?.armor_type ?? 1;
        const AT = (armorTypeOverride != null && armorTypeOverride >= 1 && armorTypeOverride <= 20)
            ? armorTypeOverride
            : Math.max(1, Math.min(20, storedAt));
        let resultRow = findAttackTableRow(weapon.system.attack_table, attackTable, totalAttack);
        const damage = resultRow[AT];

        // Only return null when the cell is missing (undefined). "-" and "F" are valid results.
        if (damage === undefined || damage === null) {
            return { damage: null, criticalSeverity: null };
        }

        return { damage: damage, criticalSeverity: attackTable.critical_severity||null };
    }

    static async loadCriticalTable(criticalType) {
        const lang = game.settings.get("rmss", "criticalTableLanguage") ?? "en";
        const path = `systems/rmss/module/combat/tables/critical/${lang}/${(CONFIG.rmss.criticalDictionary)[criticalType]}.json`;

        try {
            const response = await fetch(path);

            if (!response.ok) {
                throw new Error(`Failed to load JSON: ${response.statusText}`);
            }

            return await response.json();
        } catch (error) {
            console.error("Error loading JSON file:", error);
        }
    }

    /**
     * Resolve critical table cell for a d100 result (GM branch choice if needed). Does not post chat.
     * @returns {Promise<object|null>}
     */
    static async resolveCriticalTableRow(result, enemy, severity, critType) {
        if (severity == null || severity === "" || severity === "null") return null;
        const criticalTable = await RMSSTableManager.loadCriticalTable(critType);
        if (!criticalTable?.rows) return null;
        for (const element of criticalTable.rows) {
            const lower = parseInt(element["lower"], 10);
            const upper = parseInt(element["upper"], 10);
            if (result < lower || result > upper) continue;
            const cell = element[severity];
            if (!cell) return null;
            const criticalResult = foundry.utils.duplicate(cell);
            if (!criticalResult.hasOwnProperty("metadata")) {
                criticalResult.metadata = {};
            }
            if (cell.metadata?.length > 1) {
                const gmResponse = await socket.executeAsGM("chooseCriticalOption", cell);
                criticalResult.metadata = gmResponse;
            } else {
                criticalResult.metadata = cell.metadata?.[0] ?? {};
            }
            return criticalResult;
        }
        return null;
    }

    /**
     * Publica un mensaje de chat con el resultado de crítico (misma tirada opcional).
     * @param {object} criticalResult - Resultado de resolveCriticalTableRow
     * @param {Roll|null} roll
     * @param {object|null} expData - Si null, no se muestra bloque de XP (p. ej. crítico extra Effect Weapon).
     * @param {object} [options]
     * @param {boolean} [options.isEffectWeaponExtra]
     */
    static async announceCriticalInChat(criticalResult, roll, expData = null, options = {}) {
        if (!criticalResult) return;
        const displayRoll =
            options.displayRollTotal !== undefined && options.displayRollTotal !== null
                ? options.displayRollTotal
                : roll?.total;
        const showNaturalHint =
            options.isEffectWeaponExtra === true &&
            roll != null &&
            displayRoll != null &&
            Number(roll.total) !== Number(displayRoll);
        const naturalD100HintText = showNaturalHint
            ? game.i18n.format("rmss.combat.critical_roll_natural_d100_hint", { n: roll.total })
            : null;
        const htmlContent = await renderTemplate("systems/rmss/templates/chat/critical-result.hbs", {
            result: criticalResult,
            rollTotal: displayRoll,
            rollFormula: roll?.formula,
            expData,
            isEffectWeaponExtra: options.isEffectWeaponExtra === true,
            naturalD100HintText
        });
        const speaker = "Game Master";
        const suppressRollAttachment =
            options.isEffectWeaponExtra === true &&
            roll != null &&
            displayRoll != null &&
            Number(roll.total) !== Number(displayRoll);
        const msgData = {
            content: htmlContent,
            speaker,
            rolls: roll && !suppressRollAttachment ? [roll] : undefined
        };
        // Critical table results are always public so all players at the table see them.
        await ChatMessage.create(withPublicRollMode(msgData));
    }

    /**
     * @param {object} [options]
     * @param {boolean} [options.skipChat] - Si true, no crea mensaje en chat.
     * @param {boolean} [options.isEffectWeaponExtra] - Etiqueta visual “crítico extra” en el mensaje.
     */
    static async getCriticalTableResult(result, enemy, severity, critType, roll = null, expData = null, options = {}) {
        const skipChat = options.skipChat === true;
        const criticalResult = await RMSSTableManager.resolveCriticalTableRow(result, enemy, severity, critType);
        if (!criticalResult) return null;

        if (!skipChat) {
            await RMSSTableManager.announceCriticalInChat(criticalResult, roll, expData, {
                isEffectWeaponExtra: options.isEffectWeaponExtra === true,
                displayRollTotal: options.displayRollTotal ?? result
            });
        }

        return criticalResult;
    }

}