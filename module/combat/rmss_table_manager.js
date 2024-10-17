import {RMSSWeaponCriticalManager} from "./rmss_weapon_critical_manager.js";

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

    static async getAttackTableResult(weapon, result, enemy){
        const attackTable = await RMSSTableManager.loadAttackTable(weapon.system.attack_table);
        const at = enemy.system.armor_info.armor_type;

        for (const element of attackTable) {
            if (typeof element.Result === "string") {
                const splitRange = element.Result.split("-");
                if (result >= splitRange[0] && result <= splitRange[1]) {
                    const damage = element[at];
                    const messageContent = `Result: <b>${damage}</b>`;
                    const speaker = "Game Master";

                    await ChatMessage.create({
                        content: messageContent,
                        speaker: speaker
                    });

                    break;
                }
            }
            else if (element.Result === result) {
                const damage = element[at];
                const criticalData = RMSSWeaponCriticalManager.decomposeCriticalResult(damage);
                const htmlContent = await renderTemplate("systems/rmss/templates/combat/critical-roll-button.hbs", {
                    damage: damage,
                    criticalData: criticalData,
                    enemy:enemy
                });
                const speaker = "Game Master";

                await ChatMessage.create({
                    content: htmlContent,
                    speaker: speaker
                });
            }
        }
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
            if (result >= parseInt(element["lower"]) && result <= parseInt(element["upper"])) {
                console.log(element[severity]);
                const htmlContent = await renderTemplate("systems/rmss/templates/combat/critical-result.hbs", {
                    result: element[severity]
                });
                const speaker = "Game Master";

                await ChatMessage.create({
                    content: htmlContent,
                    speaker: speaker
                });
            }
        }
    }

}