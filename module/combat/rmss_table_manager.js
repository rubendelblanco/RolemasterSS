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

    static async loadCriticalTable(tableName) {
        const path = `${CONFIG.rmss.paths.critical_tables}${tableName}.json`;

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

    static async manageArmTableResult(result) {
        const regex = /^(\d+)?([A-Z])?([A-Z])?$/;
        const match = result.match(regex);
        const criticalDict = { 'S': 'slash', 'K': 'krush', 'P': 'puncture', 'G': 'grappling', 'T': 'tiny', 'U': 'unbalance'}

        if (result === "-") {
            console.log("No result: '-'");
        } else if (match) {
            const damage = match[1] || null;
            const severity = match[2] || null;
            const critType = match[3] || null;

            const criticalTable = await this.loadCriticalTable(criticalDict['S']);

            for (const element of criticalTable) {
                console.log(element["lower"]);
                console.log(`Lower: ${element["lower"]}, Upper: ${element["upper"]}, Result: ${result}`);
                if (result >= parseInt(element["lower"]) && result <= parseInt(element["upper"])) {
                    const row = element;
                    console.log("CRITICO: ");
                    console.log(row['severity']);
                    console.log(`Lower: ${element["lower"]}, Upper: ${element["upper"]}, Result: ${result}`);
                    break;
                }
            }

            console.log(`Damage: ${damage}, Severity: ${severity}, Crit Type: ${critType}`);
            return {'damage':damage, 'severity':severity, 'critType':critType};
        } else {
            console.log("Invalid format");
        }
    }

}