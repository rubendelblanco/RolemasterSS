import { socket } from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import CombatExperience from "../sheets/experience/rmss_combat_experience.js";
import { sendExpMessage } from "../chat/chatMessages.js";
import Utils from "../utils.js";
import { rmss } from "../config.js";
import {RMSSCombat} from "./rmss_combat.js";

class LargeCreatureCriticalStrategy {

    constructor(criticalType) {
        this.criticalType = criticalType;
    }

    getColumForCriticalSubtype(subtype) {
        switch (this.criticalType) {
            case "large_spell":
            case "superlarge_spell": {
                switch (subtype) {
                    case "normal":
                        return "A";
                    default:
                        return "B";
                }
            }
            case "large_melee":
            case "superlarge_melee": {
                switch (subtype) {
                    case "normal":
                        return "A";
                    case "magic":
                        return "B";
                    case "mithril":
                        return "C";
                    case "sacred":
                        return "D";
                    case "slaying":
                        return "E";
                    default:
                        throw new Error(`Unknown subtype ${subtype} for critical type ${this.criticalType}`);
                }
            }
        }
    }

    async apply(attackerActor, defenderActor,data = {}) {
        const {
            damage,
            severity,
            critType,
            subCritType,
            modifier = 0,
            metadata = {},
        } = data;
        const tableName = this.criticalType;

        if (Utils.isAPC(actor.id)) {
            const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(defenderActor, data.severity));
            const hpExp = parseInt(data.damage);
            let breakDown = {};
            let totalExp = 0;

            if (criticalExp === "null" || isNaN(criticalExp)) {
                breakDown = { 'hp': hpExp };
                totalExp = hpExp;
            } else {
                breakDown = { 'critical': criticalExp, 'hp': hpExp };
                totalExp = criticalExp + hpExp;
            }

            let totalExpActor = parseInt(attackerActor.system.attributes.experience_points.value || 0);
            totalExpActor += totalExp;
            await attackerActor.update({ "system.attributes.experience_points.value": totalExpActor });
            await sendExpMessage(attackerActor, breakDown, totalExp);
        }

        // 2. Tiramos el critico
        const column = this.getColumForCriticalSubtype(subCritType);
        const roll = new Roll(`1d100x>95`);
        await roll.evaluate({ async: true });
        await roll.toMessage(undefined, { create: true });
        const total = roll.total;
        // TODO: Restar cuando el bixo tiene lo de -25 o -50 por critical procedure.
        // NOTA: Esto se ejecuta como GM porque el modal de editar el critico lo edita el GM
        let newHits = defenderActor.system.attributes.hits.current - parseInt(damage);
        await defenderActor.update({ "system.attributes.hits.current": newHits });
        if (severity === "null") return;
        let result = (parseInt(total) + parseInt(modifier));
        if (result < 1) result = 1;
        else {
            result = Math.min(result, 999);
        }
        return await RMSSTableManager.getCriticalTableResult(
            result,
            defenderActor,
            column, // aka severity, pero para las critauras grandes ha habido que sacar la columna especificamente.
            tableName
        );
    }
}

class BaseCriticalStrategy {
    constructor(criticalType) {
        this.criticalType = criticalType;
    }
    async apply(attackerActor, defenderActor, data = {}) {
        if (Utils.isAPC(attackerActor)) {
            const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(defenderActor, data.severity));
            const hpExp = parseInt(data.damage);
            let breakDown = {};
            let totalExp = 0;

            if (criticalExp === "null" || isNaN(criticalExp)) {
                breakDown = {'hp': hpExp};
                totalExp = hpExp;
            } else {
                breakDown = {'critical': criticalExp, 'hp': hpExp};
                totalExp = criticalExp + hpExp;
            }

            let totalExpActor = parseInt(attackerActor.system.attributes.experience_points.value || 0);
            totalExpActor = totalExpActor + totalExp;
            await attackerActor.update({"system.attributes.experience_points.value": totalExpActor});
            await sendExpMessage(attackerActor, breakDown, totalExp);
        }
        let target = RMSSCombat.getTargets()[0].id; //token id
        return await socket.executeAsGM("updateActorHits", target, undefined, parseInt(data.damage), data);
    }
}


export class RMSSWeaponCriticalManager {
    static criticalCalculatorStrategy(criticalType) {
        switch (criticalType) {
            // TODO: Tal vez tenga sentido meter esto en un lista "verde especial".
            case "large_melee":
            case "superlarge_melee":
            case "large_spell":
            case "superlarge_spell":
                return new LargeCreatureCriticalStrategy(criticalType);
            default:
                return new BaseCriticalStrategy(criticalType);
        }
    }

    static decomposeCriticalResult(result, criticalSeverity = null) {
        // e.g result is "10A", "20B", "30C", "-", "F" or 50
        if (result === "-") { //nothing
            return { criticals: [] };
        }
        if (result === "F") { //fumble
            // TODO
            return { criticals: [] };// Also nothing 
        }

        if (typeof result === "number" || /^\d+$/.test(result)) {
            //only HP
            return { 'damage': parseInt(result, 10), 'criticals': [] };
        }

        // critical "tipo" 36CK -> 36 HP, C severity, Krush critical type
        const regex = /^(\d+)?([A-Z])?([A-Z])?$/;
        const match = result.match(regex);

        if (match) {
            const damage = match[1] || null; // e.g. "10"
            const severity = match[2] || null; // A, B, C...
            const critType = match[3] || null; // S=slash, K=krush
            if (!!severity && severity >= "F" && !!criticalSeverity) {
                // Hostia guapa. Caso especial.
                let criticalsRaw = criticalSeverity[severity];
                const criticals = Array.from(Object.entries(criticalsRaw)).map(([key, value], idx) => {
                    return { 'severity': value, 'critType': key, damage: idx === 0 ? damage : 0 };
                });

                return { damage, criticals };
            } else if (critType == null && !!criticalSeverity) {
                return { damage, criticals: [{ 'severity': severity, 'critType': criticalSeverity.default, damage }] };
            }
            return { 'damage': damage, 'criticals': [{ 'severity': severity, 'critType': critType, damage }] };
        }
        else {
            ui.notifications.error("Invalid critical format");
            return { criticals: [] };
        }
    }

    static async updateTokenOrActorHits(token, damage) {
        const actor = Utils.getActor(token);
        if (!actor) return;
        let newHits = actor.system.attributes.hits.current - parseInt(damage);
        await actor.update({ "system.attributes.hits.current": newHits });
    }

    static async updateActorHits(targetId, isToken, damage, gmResponse) {
        const token = canvas.scene.tokens.get(targetId);
        if (!token) return;
        const target = token.actor;
        let newHits = target.system.attributes.hits.current - parseInt(gmResponse.damage);
        await target.update({ "system.attributes.hits.current": newHits });
        debugger;
        if (gmResponse.severity === "null") return;
        let roll = new Roll(`(1d100)`);
        await roll.toMessage(undefined, { create: true });
        let result = (parseInt(roll.total) + parseInt(gmResponse.modifier));
        if (result < 1) result = 1;
        if (result > 100) result = 100;
        return await RMSSTableManager.getCriticalTableResult(
            result,
            target,
            gmResponse.severity,
            gmResponse.critType,
        );
    }

    /**
     * se llama cuando se hace click en el botón de chat para lanzar un crítico
     */
    static async sendCriticalMessage(
        target,
        initialDamage, initialSeverity, initialCritType, attackerId,
    ) {
        // Saca el modal formulario al GM para editar y/o confirmar el critico.
        const gmResponse = await socket.executeAsGM("confirmWeaponCritical", target.actor, initialDamage, initialSeverity, initialCritType);

        if (!gmResponse["confirmed"]) {
            return
        }
        const actor = Utils.getActor(attackerId);
        if (!actor) {
            ui.notifications.error("Attacker actor not found.");
            return;
        }

        const {
            damage,
            severity,
            critType,
            subCritType,
            modifier,
            metadata = {},
        } = gmResponse;

        let strategy = RMSSWeaponCriticalManager.criticalCalculatorStrategy(critType);

        return await strategy.apply(actor, target.actor,  { damage, severity, critType, subCritType, modifier, metadata });
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
        const initialContext = {
            enemy: enemy,
            damage: damage,
            severity: severity,
            critType: critType,
            critTables: await RMSSWeaponCriticalManager.getJSONFileNamesFromDirectory(CONFIG.rmss.paths.critical_tables),
            subcritdict: CONFIG.rmss.criticalSubtypes,
            critDict: CONFIG.rmss.criticalDictionary,
            modifier: 0,
            criticalHasSubtypes: (rmss.large_critical_types[critType] || []).length > 0,
        };
        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-critical.hbs", initialContext);

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
                            const subCritType = html.find("#critical-subtype").val();
                            const modifier = html.find("#modifier").val();
                            resolve({ confirmed: true, damage, severity, critType, subCritType, modifier });
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
                        const damage = mult * base;
                        html.find("#damage").val(damage);
                    });

                    // Tener en cuenta criaturas largas y superlargas.
                    html.find("#critical-type").on("change", (event) => {
                        const tableName = (event.target.value);
                        // Display block subtype if 
                        const criticalSubtypes = rmss.large_critical_types[tableName] || [];
                        if (criticalSubtypes.length > 0) {
                            html.find("#critical-subtype").empty();
                            criticalSubtypes.forEach((subtype) => {
                                html.find("#critical-subtype").append(`<option value="${subtype}">${subtype}</option>`);
                            });
                            html.find("#critical-subtype-container").show();
                        } else {
                            html.find("#critical-subtype-container").hide();
                        }
                    });

                    html.find(".is-positive").on("change", (event) => {
                        event.target.value = parseInt(event.target.value) < 0 ? -event.target.value : event.target.value;
                    });

                    // En funcion del tipo de critico inicial, se muestra o no el selector de subtipos.
                    if (!initialContext.criticalHasSubtypes) {
                        html.find("#critical-subtype-container").hide();
                    } else {
                        html.find("#critical-subtype-container").show();
                    }
                }
            }).render(true);
        });
        return confirmed;
    }

    static async applyCriticalTo(critical, actor, originId) {
        console.log("Applying critical to:", critical, actor, originId);
        let entity = actor;
        if (!critical || !critical.hasOwnProperty("metadata") || !critical.metadata) {
            return;
        }

        let stun_bleeding = "-";

        if (entity.system.attributes.hasOwnProperty("critical_codes")) {
            stun_bleeding = entity.system.attributes.critical_codes.stun_bleeding;
        }

        if (critical.metadata.hasOwnProperty("HP")) {
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
                    name: "Stunned",
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

        if (critical.metadata.hasOwnProperty("HPR") && stun_bleeding !== "bleeding") {
            const effectData = {
                name: "Bleeding",
                icon: `${CONFIG.rmss.paths.icons_folder}bleeding.svg`,
                origin: `Actor.${entity.id}`,
                description: critical.text,
                duration: {
                    rounds: 1,
                    startRound: game.combat ? game.combat.round : 0
                },
                flags: {
                    rmss: {
                        value: parseInt(critical.metadata["HPR"])
                    }
                },
                disabled: false
            };

            await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }


        if (critical.metadata.hasOwnProperty("PE")) {
            let penaltyValue = parseInt(critical.metadata["PE"]["VALUE"]);
            penaltyValue = penaltyValue > 0 ? -penaltyValue : penaltyValue;

            const effectData = {
                name: "Penalty",
                icon: `${CONFIG.rmss.paths.icons_folder}broken-bone.svg`,
                origin: entity.id,
                disabled: false,
                description: critical.text,
                flags: {
                    rmss:{
                        value: penaltyValue
                    }
                },
                duration: {
                    rounds: 1, //need to put a value. Otherwise, ActiveEffects doesn't render the icon in token
                    startRound: game.combat ? game.combat.round : 0
                },
            };

            await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
        }

        if (critical.metadata.hasOwnProperty("P")) {
            const existingParryEffect = entity.effects.find(e => e.name === "Parry");

            if (existingParryEffect) {
                const newRounds = (existingParryEffect.duration.rounds || 0) + stunRounds;
                await existingParryEffect.update({ "duration.rounds": newRounds });
            }
            else {
                const effectData = {
                    name: "Parry",
                    icon: `${CONFIG.rmss.paths.icons_folder}sword-clash.svg`,
                    origin: entity.id,
                    disabled: false,
                    duration: {
                        rounds: critical.metadata["P"]["ROUNDS"],
                        startRound: game.combat ? game.combat.round : 0
                    }
                };

                await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }

        if (critical.metadata.hasOwnProperty("NP")) {
            const noParryRounds = critical.metadata["NP"];
            const existingParryEffect = entity.effects.find(e => e.name === "No parry");

            if (existingParryEffect) {
                const newRounds = (noParryRounds || 0) + noParryRounds;
                await existingStunEffect.update({ "duration.rounds": newRounds });
            }
            else {
                const effectData = {
                    name: "No parry",
                    icon: `${CONFIG.rmss.paths.icons_folder}shield-disabled.svg`,
                    origin: entity.id,
                    disabled: false,
                    duration: {
                        rounds: noParryRounds,
                        startRound: game.combat ? game.combat.round : 0
                    }
                };
                await entity.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }

        if (critical.metadata.hasOwnProperty("BONUS")) {
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
                    rmss:{
                        value: parseInt(critical.metadata["BONUS"]["VALUE"])
                    }
                }
            };

            const attacker = game.actors.get(originId);
            if (attacker) {
                await attacker.createEmbeddedDocuments("ActiveEffect", [effectData]);
            }
        }

    }
    /**
     * NOTE: Due to known issues with ActiveEffect handling in Foundry VTT version 12,
     * specifically with automatic round-based duration, need to fix some issues like
     * token icon effects rendering with undefined duration effects.
     */


    static async applyCriticalToEnemy(critical, enemyId, attackerId, isToken) {
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