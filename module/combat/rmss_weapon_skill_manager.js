import {socket} from "../../rmss.js";

export class RMSSWeaponSkillManager {

    static async sendAttackMessage(actor, enemy, weapon, ob) {
        await socket.executeAsGM("confirmWeaponAttack", actor, enemy, weapon, ob);
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
        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-attack.html", {
            actor: actor,
            enemy: enemy,
            weapon: weapon,
            ob: ob,
            hitsTaken: hitsTakenPenalty
        });

        let confirmed = await new Promise((resolve) => {
            new Dialog({
                title: "Confirmar ataque",
                content: htmlContent,
                buttons: {
                    confirm: {
                        label: "Confirmar",
                        callback: (html) => {
                            const ob = parseInt(html.find("[name='ob']").val());
                            const actionPoints = parseInt(html.find("#action-points").val());
                            const hitsTaken = parseInt(html.find("#hits-taken").val());
                            const attackerParry = parseInt(html.find("#hits-taken").val());
                            const surprised = parseInt(html.find("#surprised").val());
                            const facing = parseInt(html.find("#facing").val());
                            const attackModifier = parseInt(html.find("#attack-modifier").val());
                            const attackTotal = parseInt(html.find("#attack-total").val());
                            resolve({confirmed: true, ob, actionPoints, hitsTaken, attackerParry, surprised, facing, attackModifier, attackTotal});
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

                        html.find(".calculable").each(function() {
                            if (this.type === "checkbox") {
                                total += this.checked ? parseFloat(this.value) || 0 : 0;
                            } else if (this.type === "select-one") {
                                total += parseFloat(this.value) || 0;
                            } else {
                                total += parseFloat(this.value) || 0;
                            }
                        });

                        html.find("#attack-total").val(total);
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
                    html.find(".calculable").on("change", function(event) {
                        calculateTotal();
                    });

                }
            }).render(true);
        });

        console.log(confirmed);
    }
}