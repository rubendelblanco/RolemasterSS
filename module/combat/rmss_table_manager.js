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

/**
 * @param {string[]} umArray
 * @returns {Array<{ lo: number, hi: number }>}
 */
const parseUnmodifiedTramos = (umArray) => {
    if (!Array.isArray(umArray) || umArray.length === 0) {
        return [];
    }
    return umArray.map((rangeStr) => {
        const p = String(rangeStr).split("-").map((x) => parseInt(x, 10));
        const lo = p[0];
        const hi = p.length > 1 ? p[1] : p[0];
        return { lo, hi: Number.isNaN(hi) ? lo : hi };
    });
};

export default class RMSSTableManager {
    /**
     * Dado el natural, ¿entra en algún tramo `um`? (Misma lectura que `findUnmodifiedAttack`, sin tocar `rows`.)
     * @param {number} n
     * @param {string[]|{um?: string[]}} umSource - tramos o objeto con clave `um`
     * @returns {boolean}
     */
    static isNaturalInUnmodifiedRanges(n, umSource) {
        const ums = Array.isArray(umSource) ? umSource : (umSource?.um ?? []);
        const ranges = parseUnmodifiedTramos(ums);
        return ranges.some(({ lo, hi }) => n >= lo && n <= hi);
    }
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

    /**
     * Tope de columna Result (p. ej. 100) a partir de datos ya cargados.
     * @param {object} attackTable
     * @returns {number}
     */
    static getAttackTableMaxResultFromData(attackTable) {
        if (!attackTable?.rows?.length) {
            return 100;
        }
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
            } else {
                const v = parseInt(range[0], 10);
                if (v > maximum) {
                    maximum = v;
                }
            }
        }
        return maximum;
    }

    /**
     * Enteros 1..tableMax que no caen en ningún tramo `um` (sólo con natural en UM
     * se usan filas de esos tramos). En rama modificada no se mezclan: solo el complemento.
     * @param {object} attackTable
     * @param {number} tableMax
     * @returns {{ min: number, max: number }}
     */
    static getResultIndexBoundsOutsideUnmodified(attackTable, tableMax) {
        const ums = Array.isArray(attackTable?.um) ? attackTable.um : [];
        const ranges = parseUnmodifiedTramos(ums);
        const inUm = (n) => ranges.some(({ lo, hi }) => n >= lo && n <= hi);
        let minI = null;
        let maxI = null;
        for (let n = 1; n <= tableMax; n++) {
            if (!inUm(n)) {
                if (minI === null) {
                    minI = n;
                }
                maxI = n;
            }
        }
        if (minI === null) {
            return { min: 1, max: tableMax };
        }
        return { min: minI, max: maxI };
    }

    /**
     * Mín / máx estrictos para rama de ataque modificada (no UM). Base = complemento
     * de `um` en 1..tableMax. `modified_result_clamps` en JSON no puede bajar el mínimo
     * bajo el derivado (eso metería en tramos reservados a natural UM) ni subir el máx.
     * sobre el derivado; solo puede **estrechar** (min más alto o max más bajo) si hace
     * falta regla de mesa.
     * @param {object} attackTable
     * @param {number} tableMax
     * @returns {{ min: number, max: number }}
     */
    static getSpellModifiedClamps(attackTable, tableMax) {
        const d = RMSSTableManager.getResultIndexBoundsOutsideUnmodified(attackTable, tableMax);
        const o = attackTable?.modified_result_clamps;
        if (!o || typeof o !== "object") {
            return { min: d.min, max: d.max };
        }
        let minV = d.min;
        let maxV = d.max;
        if (o.min != null && o.min !== "" && !Number.isNaN(Number(o.min))) {
            const w = Number(o.min);
            minV = Math.max(d.min, w);
        }
        if (o.max != null && o.max !== "" && !Number.isNaN(Number(o.max))) {
            const w = Number(o.max);
            maxV = Math.min(d.max, w);
        }
        if (minV > maxV) {
            return d;
        }
        return { min: minV, max: maxV };
    }

    /**
     * Índice hacia `findAttackTableRow` (columna Result) para daño: en rama no UM, tope
     * al máx. de rama modificada (ver `getSpellModifiedClamps`); con UM, al tope de tabla.
     * @param {number} value
     * @param {boolean} isUm
     * @param {number} tableMax - p. ej. 100, de `getAttackTableMaxResult[FromData]`
     * @param {object} [attackTable] - si falta, tope !UM=95 (sólo compat; ideal: siempre pasar tabla)
     * @returns {number}
     */
    static capSpellDamageLookupIndex(value, isUm, tableMax, attackTable = null) {
        if (isUm) {
            return Math.max(1, Math.min(value, tableMax));
        }
        const cap = attackTable
            ? RMSSTableManager.getSpellModifiedClamps(attackTable, tableMax).max
            : 95;
        return Math.max(1, Math.min(value, cap));
    }

    static async getAttackTableMaxResult(weapon) {
        const attackTable = await RMSSTableManager.loadAttackTable(weapon.system.attack_table);
        if (!attackTable) {
            return 1;
        }
        return RMSSTableManager.getAttackTableMaxResultFromData(attackTable);
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

    /**
     * BE area ball: EAR = natural si está en `um` (sólo así se usan filas UM); si no, total
     * mod. acotado estrictamente fuera de `um` (nunca 01–04 ni 96+ con puro modificador).
     * @param {string} tableName
     * @param {number} naturalRoll
     * @param {number} modifiedTotal - naturalRoll + diff (diff from confirm dialog)
     * @param {object} attackTable
     * @returns {{ attackColumnValue: number, isUm: boolean }}
     */
    static resolveBallEarAttackValue(tableName, naturalRoll, modifiedTotal, attackTable) {
        const umResult = RMSSTableManager.findUnmodifiedAttack(tableName, naturalRoll, attackTable);
        if (umResult) {
            return { attackColumnValue: naturalRoll, isUm: true };
        }
        const tableMax = RMSSTableManager.getAttackTableMaxResultFromData(attackTable);
        const { min, max } = RMSSTableManager.getSpellModifiedClamps(attackTable, tableMax);
        const capped = Math.min(Math.max(modifiedTotal, min), max);
        return { attackColumnValue: capped, isUm: false };
    }

    /**
     * Fire-ball style global failure: row for this attack column at AT 1 is "F".
     * @param {string} tableName
     * @param {object} attackTable
     * @param {number} attackColumnValue
     * @returns {boolean}
     */
    static isBallGlobalFailureRow(tableName, attackTable, attackColumnValue) {
        const row = findAttackTableRow(tableName, attackTable, attackColumnValue);
        return row?.["1"] === "F";
    }

}