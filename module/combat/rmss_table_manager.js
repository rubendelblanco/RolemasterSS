import {RMSSWeaponCriticalManager} from "./rmss_weapon_critical_manager.js";
import {socket} from "../../rmss.js";

const findUnmodifiedAttack = (tableName, baseAttack, attackTable) => {
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
   // Ahora buscamos la fila
    umResult.row =  findAttackTableRow(tableName, attackTable, baseAttack);
    return umResult;

}

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
            if (typeof element.Result === "string") {
                const splitRange = element.Result.split("-").map(s => s.trim());
                const row = parseInt(splitRange[1] ?? splitRange[0]);
                maximum = (row > maximum) ? row : maximum;
            }
            else if (Number.isInteger(parseInt(element.Result))){
                maximum = (element.Result > maximum) ? element.Result : maximum;
            }
        }

        return maximum;
    }

    static async getAttackTableResult(weapon, baseAttack, totalAttack, enemy, attacker){
        console.log("getAttackTableResult", weapon, baseAttack, totalAttack, enemy, attacker);
        const attackTable = await RMSSTableManager.loadAttackTable(weapon.system.attack_table);
        const AT = enemy.system.armor_info.armor_type;
        // Si sale tirada UM contemplar.
        let resultRow = null;
        const umResult = findUnmodifiedAttack(weapon.system.attack_table, baseAttack, attackTable);
        if (umResult) {
            resultRow = umResult.row;
        } else {
            resultRow = findAttackTableRow(weapon.system.attack_table, attackTable, totalAttack);
        }

        const damage = resultRow[AT];
        const criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(damage, attackTable.critical_severity||null);
        if (criticalResult.criticals.length === 0) {
            criticalResult.criticals = [
                {'severity': null, 'critType': weapon.system.critical_type, damage: criticalResult.damage}
            ];
        }
        const htmlContent = await renderTemplate("systems/rmss/templates/chat/critical-roll-button.hbs", {
            damageStr: damage,
            damage: criticalResult.damage,
            criticals: criticalResult.criticals,
            attacker: attacker
        });
        const speaker = "Game Master";

        await ChatMessage.create({
            content: htmlContent,
            speaker: speaker
        });
    }

    static async loadCriticalTable(criticalType) {
        const path = `systems/rmss/module/combat/tables/critical/${(CONFIG.rmss.criticalDictionary)[criticalType]}.json`;

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

    static async getCriticalTableResult(result, enemy, severity, critType){
        const criticalTable = await RMSSTableManager.loadCriticalTable(critType);

        for (const element of criticalTable) {
            let criticalResult = element[severity];
            if (result >= parseInt(element["lower"]) && result <= parseInt(element["upper"])) {
                if (!element[severity].hasOwnProperty("metadata")) {
                    criticalResult["metadata"] = {};
                }

                if (element[severity].metadata.length > 1) {
                    const gmResponse = await socket.executeAsGM("chooseCriticalOption", element[severity]);
                    criticalResult["metadata"] = gmResponse;
                }
                else {
                    criticalResult["metadata"] = element[severity]["metadata"][0];
                }
                const htmlContent = await renderTemplate("systems/rmss/templates/chat/critical-result.hbs", {
                    result: criticalResult
                });
                const speaker = "Game Master";
                await ChatMessage.create({
                    content: htmlContent,
                    speaker: speaker
                });

                return criticalResult;
            }
        }
    }

}