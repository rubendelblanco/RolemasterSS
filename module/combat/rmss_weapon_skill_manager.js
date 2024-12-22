import {socket} from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";

export class RMSSWeaponSkillManager {

    static async sendAttackMessage(actor, enemy, weapon, ob) {
       const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemy, weapon, ob);

       if (gmResponse["confirmed"]) {
           let roll = new Roll(`(1d100x>95) + ${gmResponse["diff"]}`);
           await roll.toMessage(undefined,{create:true});
           let result = roll.total;
           result = (result > 150) ? 150 : result;
           await RMSSTableManager.getAttackTableResult(weapon, result, enemy, actor);
       }
    }

    static async attackMessagePopup(actor, enemy, weapon, ob) {
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
        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-attack.hbs", {
            actor: actor,
            enemy: enemy,
            weapon: weapon,
            ob: ob,
            hitsTaken: hitsTakenPenalty
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
}