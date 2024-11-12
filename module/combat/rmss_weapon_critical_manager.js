import {socket} from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";

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
            enemy.system.attributes.hits.current -= parseInt(gmResponse.damage);
            let roll = new Roll(`(1d100)`);
            await roll.toMessage(undefined,{create:true});
            let result = roll.total;
            return await RMSSTableManager.getCriticalTableResult(result, enemy, gmResponse.severity, gmResponse.critType);
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
                            const damage = parseInt(html.find("#damage").val());
                            const severity = html.find("#severity").val();
                            const critType = html.find("#critical-type").val();
                            resolve({confirmed: true, damage, severity, critType});
                        }
                    },
                    cancel: {
                        label: "Cancelar",
                        callback: () => {
                            console.log("Ataque cancelado");
                        }
                    }
                },
                default: "cancel",
                render: (html) => {
                    html.find("#damage-mult").on("change", (event) => {
                        const mult = parseInt(event.target.value);
                        const base = parseInt(html.find("#damage-base").val());
                        const damage = mult*base;
                        html.find("#damage").val(damage);
                    });

                    html.find(".is-positive").on("change", (event) => {
                        event.target.value = parseInt(event.target.value) < 0 ? -event.target.value : event.target.value;
                    });
                }
            }).render(true);
        });
        return confirmed;
    }

    /**
     * NOTE: Due to known issues with ActiveEffect handling in Foundry VTT version 12,
     * specifically with automatic round-based duration, need to fix some issues like
     * token icon effects rendering with undefined duration effects.
     */
    static async applyCriticalToEnemy(critical, enemyId){
        const enemy = game.actors.get(enemyId);
        let condition = {
            "hits_per_round": enemy.system.condition.hits_per_round,
            "stunned": enemy.system.condition.stunned,
            "penalty": enemy.system.condition.penalty,
            "parry": enemy.system.condition.parry,
            "no_parry": enemy.system.condition.no_parry,
            "bonus": enemy.system.condition.bonus
        };

        if (!critical.hasOwnProperty("metadata")) {
            return;
        }

        if (critical.metadata.hasOwnProperty("HP")){
            enemy.system.attributes.hits.current -= critical.metadata.HP;
            await enemy.update({"system.attributes.hits.current": enemy.system.attributes.hits.current});
        }

        if (critical.metadata.hasOwnProperty("STUN")) {
            const stunRounds = critical.metadata["STUN"]["ROUNDS"];
            const existingStunEffect = enemy.effects.find(e => e.name === "Stunned");

            if (existingStunEffect) {
                const newRounds = (existingStunEffect.duration.rounds || 0) + stunRounds;
                console.log(newRounds);
                await existingStunEffect.update({ "duration.rounds": newRounds });
            } else {
                const effectData = {
                    label: "Stunned",
                    icon: `${CONFIG.rmss.paths.icons_folder}stunned.svg`,
                    origin: enemyId,
                    duration: {
                        rounds: stunRounds,
                        startRound: game.combat ? game.combat.round : 0
                    },
                    disabled: false
                };

                await enemy.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }

        if (critical.metadata.hasOwnProperty("HPR")){
            const effectData = {
                name: "Bleeding",
                icon: `${CONFIG.rmss.paths.icons_folder}bleeding.svg`,
                origin: enemyId,
                duration: {
                    rounds: 1, //need to put a value. Otherwise, ActiveEffects doesn't render the icon in token
                    startRound: game.combat ? game.combat.round : 0
                },
                flags: {
                    value: parseInt(critical.metadata["HPR"])
                },
                disabled: false
            };

            await enemy.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        if (critical.metadata.hasOwnProperty("PE")){
            const effectData = {
                name: "Penalty",
                icon: `${CONFIG.rmss.paths.icons_folder}broken-bone.svg`,
                origin: enemyId,
                disabled: false,
                description: critical.text,
                flags: {
                    value: parseInt(critical.metadata["PE"]["VALUE"])
                },
                duration: {
                    rounds: 1, //need to put a value. Otherwise, ActiveEffects doesn't render the icon in token
                    startRound: game.combat ? game.combat.round : 0
                },
            };

            await enemy.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        if (critical.metadata.hasOwnProperty("P")){
            const effectData = {
                name: "Parry",
                icon: `${CONFIG.rmss.paths.icons_folder}sword-clash.svg`,
                origin: enemyId,
                disabled: false,
                description: critical.text,
                duration: {
                    rounds: critical.metadata["P"]["ROUNDS"],
                    startRound: game.combat ? game.combat.round : 0
                }
            };

            await enemy.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        if (critical.metadata.hasOwnProperty("NP")){
            const noParryRounds = critical.metadata["NP"];
            const effectData = {
                name: "No parry",
                icon: `${CONFIG.rmss.paths.icons_folder}shield-disabled.svg`,
                origin: enemyId,
                disabled: false,
                description: critical.text,
                duration: {
                    rounds: 1,
                    startRound: game.combat ? game.combat.round : 0
                }
            };

            for (let i = 0; i < noParryRounds; i++) {
                await enemy.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }

        if (critical.metadata.hasOwnProperty("BONUS")){
            const effectData = {
                name: "Bonus",
                icon: `${CONFIG.rmss.paths.icons_folder}bonus.svg`,
                origin: enemyId,
                disabled: false,
                description: critical.text,
                duration: {
                    rounds: critical.metadata["BONUS"] && critical.metadata["BONUS"]["ROUNDS"] ? critical.metadata["BONUS"]["ROUNDS"] : 1,
                    startRound: game.combat ? game.combat.round : 0
                },
                flags: {
                    value: parseInt(critical.metadata["BONUS"]["VALUE"])
                }
            };

            await enemy.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        console.log("Critical");
        console.log(critical.metadata);
        console.log("Condition");
        console.log(condition);
        await enemy.update({"system.condition": condition});
    }


static async chooseCriticalOption(criticalResult) {
        let option = await new Promise((resolve) => {
            new Dialog({
                title: "Elige una opción",
                content: `<p class="critical-description">${criticalResult.text}</p>`,
                buttons: {
                    optionA: {
                        label: `${criticalResult.metadata[0].DESC}`,
                        callback: () => resolve(criticalResult.metadata[0])
                    },
                    optionB: {
                        label: `${criticalResult.metadata[1].DESC}`,
                        callback: () => resolve(criticalResult.metadata[1])
                    }
                },
                default: "optionA"
            }).render(true);
        });

        return option;
    }
}