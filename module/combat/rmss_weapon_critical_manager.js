import {socket} from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import CombatExperience from "../sheets/experience/rmss_combat_experience.js";
import {sendExpMessage} from "../chat/chatMessages.js";
import Utils from "../utils.js";

export class RMSSWeaponCriticalManager {
    static decomposeCriticalResult(result, criticalSeverity=null) {
        // e.g result is "10A", "20B", "30C", "–", "F" or 50
        if (result === "–") { //nothing
            return {criticals: []};
        }
        if (result === "F") { //fumble
            // TODO
            return {criticals: []};// Also nothing 
        }

        if (typeof result === "number") { //only HP
            return {'damage':result, 'criticals': [{'severity':"null", 'critType':"null"}]};
        }
        else { //critical
            const regex = /^(\d+)?([A-Z])?([A-Z])?$/;
            const match = result.match(regex);

            if (match) {
                const damage = match[1] || null; // e.g. "10"
                const severity = match[2] || null; // A, B, C...
                const critType = match[3] || null; // S=slash, K=krush
                if (!!severity && severity >= "F" && !!criticalSeverity) {
                    // Hostia guapa. Caso especial.
                    let criticalsRaw = criticalSeverity[severity];
                    const criticals = Array.from(Object.entries(criticalsRaw)).map(([key, value]) => {
                        return {'severity': value, 'critType': key};
                    });

                    return {damage, criticals};
                } else if (critType==null && !!criticalSeverity) {
                    return {damage, criticals: [{'severity':severity, 'critType':criticalSeverity.default}]};
                }
                return {'damage':damage, 'criticals': [{'severity':severity, 'critType':critType}]};
            }
            else {
                ui.notifications.error("Invalid critical format");
                return {criticals:[]};
            }
        }
    }

    static async updateActorHits(targetId, isToken, damage, gmResponse) {
        let target;

        if (isToken) {
            target = canvas.tokens.get(targetId)?.actor;
        } else {
            target = game.actors.get(targetId);
        }
        if (!target) return;
        let newHits = target.system.attributes.hits.current - parseInt(gmResponse.damage);
        await target.update({ "system.attributes.hits.current": newHits });
        if (gmResponse.severity === "null") return;
        let roll = new Roll(`(1d100)`);
        await roll.toMessage(undefined,{create:true});
        let result = (parseInt(roll.total)+parseInt(gmResponse.modifier));
        if (result < 1) result = 1;
        if (result > 100) result = 100;
        return await RMSSTableManager.getCriticalTableResult(result, target, gmResponse.severity, gmResponse.critType);
    }

    static async sendCriticalMessage2(target) {
        const gmResponse = await socket.executeAsGM("confirmWeaponCritical", target.actor, damage, severity, critType);


        if (gmResponse["confirmed"]) {
            const actor = Utils.isAPC(attackerId);
            if (actor) {
                let breakDown;
                let totalExp;
                const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(target.actor, gmResponse.severity));
                const hpExp = parseInt(damage);

                if (criticalExp==="null" || isNaN(criticalExp)) {
                    breakDown = {'hp':hpExp};
                    totalExp = hpExp;
                }
                else{
                    breakDown = {'critical':criticalExp, 'hp':hpExp};
                    totalExp = criticalExp+hpExp;
                }

                let totalExpActor = parseInt(actor.system.attributes.experience_points.value);
                totalExpActor = totalExpActor + totalExp;
                await actor.update({"system.attributes.experience_points.value": totalExpActor});
                sendExpMessage(actor, breakDown, totalExp);
            }
            return await socket.executeAsGM("updateActorHits", target.id, target instanceof Token, parseInt(gmResponse.damage), gmResponse);
        }
    }

    static async sendCriticalMessage(target, damage, severity, critType, attackerId) {
        const gmResponse = await socket.executeAsGM("confirmWeaponCritical", target.actor, damage, severity, critType);

        if (gmResponse["confirmed"]) {
            const actor = Utils.isAPC(attackerId);
            if (actor) {
                let breakDown;
                let totalExp;
                const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(target.actor, gmResponse.severity));
                const hpExp = parseInt(damage);

                if (criticalExp==="null" || isNaN(criticalExp)) {
                    breakDown = {'hp':hpExp};
                    totalExp = hpExp;
                }
                else{
                    breakDown = {'critical':criticalExp, 'hp':hpExp};
                    totalExp = criticalExp+hpExp;
                }

                let totalExpActor = parseInt(actor.system.attributes.experience_points.value);
                totalExpActor = totalExpActor + totalExp;
                await actor.update({"system.attributes.experience_points.value": totalExpActor});
                sendExpMessage(actor, breakDown, totalExp);
            }
            return await socket.executeAsGM("updateActorHits", target.id, target instanceof Token, parseInt(gmResponse.damage), gmResponse);
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
            critDict: CONFIG.rmss.criticalDictionary,
            modifier: 0
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
                            const modifier = html.find("#modifier").val();
                            resolve({confirmed: true, damage, severity, critType, modifier});
                        }
                    },
                    cancel: {
                        label: "Cancelar",
                        callback: () => {
                            ui.notifications.error("Attack cancelled!");
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

    static async applyCriticalTo(critical, token, originId){
        console.log("Applying critical to:", critical, token, originId);
        let entity = token.actor;

        if (!critical || !critical.hasOwnProperty("metadata")) {
            return;
        }

        let stun_bleeding = "-";

        if (entity.system.attributes.hasOwnProperty("critical_codes")) {
            stun_bleeding = entity.system.attributes.critical_codes.stun_bleeding;
        }

        if (critical.metadata.hasOwnProperty("HP")){
            entity.system.attributes.hits.current -= parseInt(critical.metadata["HP"]);
            await entity.update({ "system.attributes.hits.current": entity.system.attributes.hits.current });
        }

        if (critical.metadata.hasOwnProperty("STUN") && stun_bleeding === "-") {
            const stunRounds = critical.metadata["STUN"]["ROUNDS"];
            const existingStunEffect = entity.effects.find(e => e.name === "Stunned");

            if (existingStunEffect) {
                const newRounds = (existingStunEffect.duration.rounds || 0) + stunRounds;
                await existingStunEffect.update({ "duration.rounds": newRounds });
            } else {
                const effectData = {
                    label: "Stunned",
                    icon: `${CONFIG.rmss.paths.icons_folder}stunned.svg`,
                    origin: entity.id,
                    duration: {
                        rounds: stunRounds,
                        startRound: game.combat ? game.combat.round : 0
                    },
                    disabled: false
                };

                await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }

        if (critical.metadata.hasOwnProperty("HPR") && stun_bleeding !== "bleeding"){
            const effectData = {
                name: "Bleeding",
                icon: `${CONFIG.rmss.paths.icons_folder}bleeding.svg`,
                origin: entity.id,
                duration: {
                    rounds: 1, //need to put a value. Otherwise, ActiveEffects doesn't render the icon in token
                    startRound: game.combat ? game.combat.round : 0
                },
                flags: {
                    value: parseInt(critical.metadata["HPR"])
                },
                disabled: false
            };

            await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        if (critical.metadata.hasOwnProperty("PE")){
            let penaltyValue = parseInt(critical.metadata["PE"]["VALUE"]);
            penaltyValue = penaltyValue > 0 ? -penaltyValue: penaltyValue;

            const effectData = {
                name: "Penalty",
                icon: `${CONFIG.rmss.paths.icons_folder}broken-bone.svg`,
                origin: entity.id,
                disabled: false,
                description: critical.text,
                flags: {
                    value: penaltyValue
                },
                duration: {
                    rounds: 1, //need to put a value. Otherwise, ActiveEffects doesn't render the icon in token
                    startRound: game.combat ? game.combat.round : 0
                },
            };

            await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        if (critical.metadata.hasOwnProperty("P")){
            const effectData = {
                name: "Parry",
                icon: `${CONFIG.rmss.paths.icons_folder}sword-clash.svg`,
                origin: entity.id,
                disabled: false,
                description: critical.text,
                duration: {
                    rounds: critical.metadata["P"]["ROUNDS"],
                    startRound: game.combat ? game.combat.round : 0
                }
            };

            await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        if (critical.metadata.hasOwnProperty("NP")){
            const noParryRounds = critical.metadata["NP"];
            const effectData = {
                name: "No parry",
                icon: `${CONFIG.rmss.paths.icons_folder}shield-disabled.svg`,
                origin: entity.id,
                disabled: false,
                description: critical.text,
                duration: {
                    rounds: 1,
                    startRound: game.combat ? game.combat.round : 0
                }
            };

            for (let i = 0; i < noParryRounds; i++) {
                await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }

        if (critical.metadata.hasOwnProperty("BONUS")){
            const effectData = {
                name: "Bonus",
                icon: `${CONFIG.rmss.paths.icons_folder}bonus.svg`,
                origin: originId,
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

            await attacker.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        console.log("Critical");
        console.log(critical.metadata);
    }
    /**
     * NOTE: Due to known issues with ActiveEffect handling in Foundry VTT version 12,
     * specifically with automatic round-based duration, need to fix some issues like
     * token icon effects rendering with undefined duration effects.
     */


    static async applyCriticalToEnemy(critical, enemyId, attackerId, isToken){
        console.log("Applying critical to enemy:", critical, enemyId, attackerId, isToken);
        let entity;

        if (isToken) {
            const enemy = canvas.scene.tokens.get(enemyId);
            if (!enemy) return ui.notifications.error("Token not found.");
            entity = enemy.actor;
        } else {
            entity = game.actors.get(enemyId);
            if (!entity) return ui.notifications.error("Actor not found.");
        }

        return await RMSSWeaponCriticalManager.applyCriticalTo(critical, entity, attackerId);
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