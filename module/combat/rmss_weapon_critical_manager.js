import { socket } from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import CombatExperience from "../sheets/experience/rmss_combat_experience.js";
import { sendExpMessage } from "../chat/chatMessages.js";
import Utils from "../utils.js";
import { rmss } from "../config.js";
import {RMSSCombat} from "./rmss_combat.js";
import {RMSSEffectApplier} from "./rmss_effect_applier.js";


/* ---------------------------------------------
 * Mapping of column results for large creature criticals
 * --------------------------------------------- */
const CRITICAL_COLUMN_MAP = {
    large_spell: { normal: "A", default: "B" },
    superlarge_spell: { normal: "A", default: "B" },
    large_melee: {
        normal: "A",
        magic: "B",
        mithril: "C",
        sacred: "D",
        slaying: "E"
    },
    superlarge_melee: {
        normal: "A",
        magic: "B",
        mithril: "C",
        sacred: "D",
        slaying: "E"
    }
};

class LargeCreatureCriticalStrategy {
    constructor(criticalType) {
        this.criticalType = criticalType;
    }

    /**
     * Determine which critical table column applies to this subtype.
     * @param {string} subtype - The weapon or material subtype (normal, magic, mithril, etc.)
     * @returns {string} - The letter of the column (A–E).
     */
    getColumForCriticalSubtype(subtype) {
        const map = CRITICAL_COLUMN_MAP[this.criticalType];
        if (!map) throw new Error(`Unknown critical type: ${this.criticalType}`);
        return map[subtype] ?? map.default ?? "A";
    }

    async apply(attackerActor, defenderActor, data = {}) {
        const {
            damage,
            severity,
            critType,
            subCritType,
            modifier = 0,
            metadata = {},
        } = data;
        const tableName = this.criticalType;

        // Apply XP for player characters
        if (Utils.isAPC(attackerActor.id)) {
            const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(defenderActor, data.severity));
            const hpExp = parseInt(data.damage);
            const breakDown = isNaN(criticalExp)
                ? { hp: hpExp }
                : { critical: criticalExp, hp: hpExp };
            const totalExp = Object.values(breakDown).reduce((a, b) => a + b, 0);
            const totalExpActor = parseInt(attackerActor.system.attributes.experience_points.value || 0) + totalExp;

            await attackerActor.update({ "system.attributes.experience_points.value": totalExpActor });
            await sendExpMessage(attackerActor, breakDown, totalExp);
        }

        // Roll for the critical
        const column = this.getColumForCriticalSubtype(subCritType);
        const roll = new Roll(`1d100x>95`);
        await roll.evaluate({ async: true });
        await roll.toMessage(undefined, { create: true });

        let newHits = defenderActor.system.attributes.hits.current - parseInt(damage);
        await defenderActor.update({ "system.attributes.hits.current": newHits });
        if (severity === "null") return;

        let result = Math.min(Math.max(parseInt(roll.total) + parseInt(modifier), 1), 999);
        return await RMSSTableManager.getCriticalTableResult(result, defenderActor, column, tableName);
    }
}

class BaseCriticalStrategy {
    constructor(criticalType) {
        this.criticalType = criticalType;
    }

    async apply(attackerActor, defenderActor, data = {}) {
        if (Utils.isAPC(attackerActor.id)) {
            const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(defenderActor, data.severity));
            const hpExp = parseInt(data.damage);
            let breakDown = {};
            let totalExp = 0;

            if (criticalExp === "null" || isNaN(criticalExp)) {
                breakDown = { hp: hpExp };
                totalExp = hpExp;
            } else {
                breakDown = { critical: criticalExp, hp: hpExp };
                totalExp = criticalExp + hpExp;
            }

            let totalExpActor = parseInt(attackerActor.system.attributes.experience_points.value || 0);
            totalExpActor = totalExpActor + totalExp;
            await attackerActor.update({ "system.attributes.experience_points.value": totalExpActor });
            await sendExpMessage(attackerActor, breakDown, totalExp);
        }

        const target = RMSSCombat.getTargets()[0].id;
        return await socket.executeAsGM("updateActorHits", target, undefined, parseInt(data.damage), data);
    }
}

export class RMSSWeaponCriticalManager {
    static criticalCalculatorStrategy(criticalType) {
        switch (criticalType) {
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
            return { criticals: 'fumble' };// Also nothing
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
        if (isNaN(damage)) return;
        const target = token.actor;
        let newHits = target.system.attributes.hits.current - parseInt(gmResponse.damage);
        await target.update({ "system.attributes.hits.current": newHits });
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

    static async sendCriticalMessage(target, initialDamage, initialSeverity, initialCritType, attackerId,) {
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

    static async criticalMessagePopup(enemy, damage, severity, critType) {
        let modifier = 0;
        if (enemy.type === "creature" || enemy.type === "npc") {
            if (enemy.system.attributes.critical_codes.critical_procedure === "I") {
                const S = ["A","B","C","D","E"];
                if (severity === "A") modifier -= 25;
                else severity = S[Math.max(0, S.indexOf(severity) - 1)];
            }
            else if (enemy.system.attributes.critical_codes.critical_procedure === "II") {
                const S = ["A","B","C","D","E"];
                if (severity === "A") modifier -= 50;
                else if (severity === "B") modifier -= 25;
                else severity = S[Math.max(0, S.indexOf(severity) - 1)];
            }
        }

        const initialContext = {
            enemy: enemy,
            damage: damage,
            severity: severity,
            critType: critType,
            critTables: await game.rmss?.attackTableIndex || [],
            subcritdict: CONFIG.rmss.criticalSubtypes,
            critDict: CONFIG.rmss.criticalDictionary,
            modifier: modifier,
            criticalHasSubtypes: (rmss.large_critical_types[critType] || []).length > 0,
        };
        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-critical.hbs", initialContext);

        let confirmed = await new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.confirm_critical"),
                content: htmlContent,
                buttons: {
                    confirm: {
                        label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
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
                        label: `❌ ${game.i18n.localize("rmss.combat.cancel")}`,
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
        return await RMSSEffectApplier.applyCriticalEffects(critical, actor, originId);
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

    static async getFumbleMessage(attacker){
        const htmlContent = await renderTemplate("systems/rmss/templates/chat/fumble-result.hbs", {
            attacker: attacker
        });
        const speaker = "Game Master";

        await ChatMessage.create({
            content: htmlContent,
            speaker: speaker
        });
    }

    static async getCriticalMessage(damage, criticalResult, attacker, target = null) {
        const htmlContent = await renderTemplate("systems/rmss/templates/chat/critical-roll-button.hbs", {
            damageStr: damage,
            damage: criticalResult.damage,
            criticals: criticalResult.criticals,
            attacker: attacker,
            target: target
        });
        const speaker = "Game Master";

        await ChatMessage.create({
            content: htmlContent,
            speaker: speaker
        });
    }
}