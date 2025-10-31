import {RMSSWeaponCriticalManager} from "./rmss_weapon_critical_manager.js";
import {ExperienceManager} from "../sheets/experience/rmss_experience_manager.js";
import {socket} from "../../rmss.js";

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

    static async getAttackTableResult(weapon, attackTable, totalAttack, enemy, attacker, isUM = false){
        const AT = enemy.system.armor_info.armor_type;
        let resultRow = findAttackTableRow(weapon.system.attack_table, attackTable, totalAttack);
        const damage = resultRow[AT];
        if (isNaN(parseInt(damage))) {
            return;
        }
        const criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(damage,attackTable.critical_severity||null,);

        //fumble!
        if (criticalResult.criticals === "fumble"){
            await RMSSWeaponCriticalManager.getFumbleMessage(attacker);
        }

        //critical exists
        if (criticalResult.criticals.length === 0) {
            criticalResult.criticals = [
                {'severity': null, 'critType': weapon.system.critical_type, damage: 0}
            ];
            await RMSSWeaponCriticalManager.updateTokenOrActorHits(
                enemy,
                parseInt(criticalResult.damage)
            );
            if (attacker.type === "character") {
                await ExperienceManager.applyExperience(attacker, criticalResult.damage);
            }
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

    static async getCriticalTableResult(result, enemy, severity, critType){
        const criticalTable = await RMSSTableManager.loadCriticalTable(critType);
        for (const element of criticalTable.rows) {
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