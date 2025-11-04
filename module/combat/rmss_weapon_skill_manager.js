import {socket} from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import Utils from "../utils.js";
import RollService from "./services/roll_service.js";
import {RMSSWeaponCriticalManager} from "./rmss_weapon_critical_manager.js";

export class RMSSWeaponSkillManager {

    static async handleAttack(actor, enemy, weapon) {
        const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemy, weapon);
        if (!gmResponse.confirmed) return;
        const rollData = await RollService.highOpenEndedD100();
        let total = rollData.total + gmResponse.diff;
        const text = `${rollData.details} → +${gmResponse.diff} = <b>${total}</b>`;
        const flavor = await renderTemplate("systems/rmss/templates/chat/attack-result.hbs", {
            actor,
            enemy,
            weapon,
            gmResponse,
            text
        });

        await ChatMessage.create({
            rolls: rollData.roll,
            flavor: flavor,
            speaker: "Game master"
        });

        const baseAttack = rollData.roll.terms[0].results[0].result;
        const tableName = weapon.system.attack_table;
        const attackTable = await RMSSTableManager.loadAttackTable(tableName);
        const um = RMSSTableManager.findUnmodifiedAttack(tableName, baseAttack, attackTable) != null;
        const maximum = await RMSSTableManager.getAttackTableMaxResult(weapon);

        if (um) {
            total = um;
        }
        else {
            total = (total > maximum) ? maximum : total;
        }

        const attackResult = await RMSSTableManager.getAttackTableResult(weapon, attackTable, total, enemy, actor);
        const criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(attackResult.damage,attackTable.critical_severity||null);
        //fumble!
        if (criticalResult.criticals === "fumble"){
            await RMSSWeaponCriticalManager.getFumbleMessage(attacker);
            return;
        }

        //critical not exists
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

        await RMSSWeaponCriticalManager.getCriticalMessage(attackResult.damage, criticalResult, actor);
    }

    static async attackMessagePopup(actor, enemy, weapon) {
        const moveRatio = (actor.system.attributes.movement_rate.current / actor.system.attributes.movement_rate.value);

        if (moveRatio < 0.5) {
            ui.notifications.warn("Unable to attack (activity behind 50%)", {localize: true});
            return;
        }

        const ob = RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, actor);
        const hitsTakenPenalty = RMSSWeaponSkillManager._getHitsPenalty(actor);
        const penaltyEffects = Utils.getEffectByName(actor, "Penalty");
        const bonusEffects = Utils.getEffectByName(actor, "Bonus");
        const stunEffect = Utils.getEffectByName(enemy, "Stunned");
        let bonusValue = 0;
        let stunnedValue = false;
        let penaltyValue = 0;
        const movePenalty = Math.round(
            (1 - (moveRatio)) * 100
        );
        debugger;

        penaltyEffects.forEach( (penalty) => {
            penaltyValue += penalty.flags.rmss.value;
        })

        //bonus - movement used in the round
        bonusEffects.forEach((bonus) => {
            bonusValue += bonus.flags.rmss.value;
        })

        bonusValue = bonusValue - movePenalty;

        if (stunEffect.length > 0 && stunEffect[0].duration.rounds > 0) {
            stunnedValue = true;
        }

        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-attack.hbs", {
            actor: actor,
            enemy: enemy,
            weapon: weapon,
            ob: ob,
            hitsTaken: hitsTakenPenalty,
            bonusValue: bonusValue,
            stunnedValue: stunnedValue,
            penaltyValue: penaltyValue,
        });

        let confirmed = await new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.confirm_attack"),
            content: htmlContent,
                buttons: {
                    confirm: {
                        label: "✅ Confirmar",
                        callback: (html) => {
                            const attackTotal = parseInt(html.find("#attack-total").val());
                            const defenseTotal = parseInt(html.find("#defense-total").val());
                            const diff = parseInt(html.find("#difference").val());
                            resolve({confirmed: true, attackTotal, defenseTotal, diff});
                        }
                    },
                    cancel: {
                        label: "❌ Cancelar",
                        callback: () => resolve({confirmed: false})
                    }
                },
                default: "cancel",
                render: (html) => {
                    function calculateTotal(){
                        let total = 0;

                        html.find(".attacker .calculable").each(function() {
                            if (this.type === "checkbox") {
                                total += this.checked ? parseInt(this.value) || 0 : 0;
                            } else if (this.type === "select-one") {
                                total += parseInt(this.value) || 0;
                            } else {
                                total += parseInt(this.value) || 0;
                            }
                        });

                        html.find("#attack-total").val(total);
                        total = 0;

                        html.find(".defender .calculable").each(function() {
                            if (this.type === "checkbox") {
                                total += this.checked ? parseInt(this.value) || 0 : 0;
                            } else if (this.type === "select-one") {
                                total += parseInt(this.value) || 0;
                            } else {
                                total += parseInt(this.value) || 0;
                            }
                        });

                        html.find("#defense-total").val(total);
                        html.find("#difference").val(html.find("#attack-total").val() - html.find("#defense-total").val());
                    }
                    calculateTotal();
                    setTimeout(() => {
                        html.closest(".dialog").css({
                            width: "800px",
                            height: "auto",
                        });
                    }, 0);
                    html.find(".is-negative").on("change", (event) => {
                         event.target.value = parseInt(event.target.value) > 0 ? -event.target.value : event.target.value;
                    });
                    html.find(".is-positive").on("change", (event) => {
                        event.target.value = parseInt(event.target.value) < 0 ? -event.target.value : event.target.value;
                    });
                    html.find("#target-at").on("change", (event) => {
                        if (event.target.value < 1) {
                            event.target.value = 1;
                        }
                        else if (event.target.value > 20) {
                            event.target.value = 20;
                        }
                    });
                    html.find(".calculable").on("change", function(event) {
                        calculateTotal();
                    });

                }
            }).render(true);
        });
        return confirmed;
    }

    static _getOffensiveBonusFromWeapon(weapon, actor) {
        const skillId = weapon.system.offensive_skill;
        const skillItem = game.actors.get(actor._id).items.get(skillId);

        if (!skillItem) {
            return 0;
        } else {
            return skillItem.system.total_bonus ?? 0;
        }
    }

    static _getHitsPenalty(actor) {
        const hitsTaken = (actor.system.attributes.hits.current/actor.system.attributes.hits.max)*100;
        let hitsTakenPenalty = 0;

        if (hitsTaken < 75 && hitsTaken >=50) {
            hitsTakenPenalty = -10;
        }
        else if (hitsTaken < 50 && hitsTaken >=25) {
            hitsTakenPenalty = -20;
        }
        else if (hitsTaken < 25) {
            hitsTakenPenalty = -30;
        }

        return hitsTakenPenalty;
    }
}