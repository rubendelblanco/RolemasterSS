import {socket} from "../../rmss.js";

export class RMSSWeaponCriticalManager {
    static decomposeCriticalResult(result) {
        const regex = /^(\d+)?([A-Z])?([A-Z])?$/;
        const match = result.match(regex);

        if (result === "-") {
            return {};
        } else if (match) {
            const damage = match[1] || null;
            const severity = match[2] || null;
            const critType = match[3] || null;

            return {'damage':damage, 'severity':severity, 'critType':critType};
        } else {
            console.log("Invalid format");
            return {};
        }
    }

    static async sendCriticalMessage(enemyId, damage, severity, critType) {
        const enemy = game.actors.get(enemyId);
        const gmResponse = await socket.executeAsGM("confirmWeaponCritical", enemy, damage, severity, critType);

        if (gmResponse["confirmed"]) {
            let roll = new Roll(`(1d100)`);
            await roll.toMessage(undefined,{create:true});
            let result = roll.total;
        }
    }

    static async getJSONFileNamesFromDirectory(directory) {
        // Open the file picker and retrieve the files from the specified directory
        const picker = await FilePicker.browse("data", directory);

        const jsonFilesObject = picker.files
            .filter(file => file.endsWith(".json"))
            .reduce((obj, file) => {
                const fileName = file.split('/').pop().replace(".json", "");
                obj[fileName] = fileName; // Create an entry where key and value are the same
                return obj;
            }, {});

        return jsonFilesObject;
    }

    static async criticalMessagePopup(enemy, damage, severity, critType) {
        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-critical.hbs", {
            enemy: enemy,
            damage: damage,
            severity: severity,
            critType: critType,
            critTables: await RMSSWeaponCriticalManager.getJSONFileNamesFromDirectory(CONFIG.rmss.paths.critical_tables),
            critDict: CONFIG.rmss.criticalDictionary
        });

        let confirmed = await new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.confirm_attack"),
                content: htmlContent,
                buttons: {
                    confirm: {
                        label: "Confirmar",
                        callback: (html) => {
                            // Lógica para el botón de confirmación
                            console.log("Ataque confirmado");
                        }
                    },
                    cancel: {
                        label: "Cancelar",
                        callback: () => {
                            console.log("Ataque cancelado");
                        }
                    }
                },
                default: "cancel"
            }).render(true);
        })
    }
}