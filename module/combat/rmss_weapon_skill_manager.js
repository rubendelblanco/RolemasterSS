import {socket} from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import Utils from "../utils.js";
import RollService from "./services/roll_service.js";

export class RMSSWeaponSkillManager {

    static async handleAttack(actor, enemy, weapon) {
        const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemy, weapon);
        if (!gmResponse.confirmed) return;
        const rollData = await RollService.highOpenEndedD100();
        let total = rollData.total + gmResponse.diff;
        const text = `${rollData.details} → +${gmResponse.diff} = <b>${total}</b>`;
        const flavor = `
          <div style="display:flex; align-items:center; justify-content:center; gap:8px; margin-bottom:4px;">
            <img src="${actor.img}" width="50" height="50" style="border-radius:6px;">
            <span style="font-weight:bold;">VS</span>
            <img src="${enemy.img}" width="50" height="50" style="border-radius:6px;">
          </div>
          <b>${actor.name}</b> ataca a <b>${enemy.name}</b> con <b>${weapon.name}</b><br/>
          OB: ${gmResponse.attackTotal} / DB: ${gmResponse.defenseTotal}<br/>
          Diferencia: ${gmResponse.diff}<br/>
          <i>${text}</i><br/>
        `;

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

        await RMSSTableManager.getAttackTableResult(weapon, attackTable, total, enemy, actor, um);
    }

    static async sendAttackMessage(actor, enemy, weapon) {
        // TODO: "ob" es la bonificación ofensiva inicial? unused?
        const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemy, weapon);

        if (gmResponse["confirmed"]) {
            const attackRoll = new Roll(`1d100x>95`);
            await attackRoll.evaluate();
            const flavor = `
                <b>${actor.name}</b> ataca con <b>${weapon.name}</b> y bonificación ofensiva de <b>${gmResponse.attackTotal}</b><br/>
                a <b>${enemy.name}</b> con bonificación defensiva de <b>${gmResponse.defenseTotal}</b>.<br/>
                Diferencia final: <b>${gmResponse.diff}</b><br/>
                <i>Tirada: 1d100x>95 + ${gmResponse.diff}</i><br/>
                <b>Total: ${attackRoll.total + gmResponse.diff}</b>
            `;
            await attackRoll.toMessage({
                flavor: flavor
            }, {create: true});
            const baseAttack = attackRoll.terms[0].results[0].result;

            let totalAttack = attackRoll.total + gmResponse["diff"];
            const maximum = await RMSSTableManager.getAttackTableMaxResult(weapon);
            totalAttack = (totalAttack > maximum) ? maximum : totalAttack;
            await RMSSTableManager.getAttackTableResult(weapon, baseAttack, totalAttack, enemy, actor);
        }
    }

    static async attackMessagePopup(actor, enemy, weapon) {
        const ob = RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon);
        const hitsTakenPenalty = RMSSWeaponSkillManager._getHitsPenalty(actor);
        const penaltyEffects = Utils.getEffectByName(actor, "Penalty");
        const bonusEffects = Utils.getEffectByName(actor, "Bonus");
        const stunEffect = Utils.getEffectByName(enemy, "Stunned");
        let bonusValue = 0;
        let stunnedValue = false;
        let penaltyValue = 0;

        penaltyEffects.forEach( (penalty) => {
            penaltyValue += penalty.flags.rmss.value;
        })

        bonusEffects.forEach((bonus) => {
            bonusValue += bonus.flags.rmss.value;
        })

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
            penaltyValue: penaltyValue
        });

        let confirmed = await new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.confirm_attack"),
            content: htmlContent,
                buttons: {
                    confirm: {
                        label: "Confirmar",
                        callback: (html) => {
                            const attackTotal = parseInt(html.find("#attack-total").val());
                            const defenseTotal = parseInt(html.find("#defense-total").val());
                            const diff = parseInt(html.find("#difference").val());
                            resolve({confirmed: true, attackTotal, defenseTotal, diff});
                        }
                    },
                    cancel: {
                        label: "Cancelar",
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
                    html.find("#action-points").on("change", (event) => {
                        let actionPoints = parseInt(event.target.value);
                        if (actionPoints < 2) actionPoints = 2;
                        if (actionPoints > 4) actionPoints = 4;
                        event.target.value = actionPoints;
                        const actionPenalty = (4-actionPoints)*(-25);
                        html.find("#action-points-penalty").val(actionPenalty);
                        calculateTotal();
                    });
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

    static _getOffensiveBonusFromWeapon(weapon) {
        const skillId = weapon.system.offensive_skill;
        const skillItem = weapon.actor?.items.get(skillId);

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