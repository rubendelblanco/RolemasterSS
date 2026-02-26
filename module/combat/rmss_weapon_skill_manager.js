import { socket } from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import Utils from "../utils.js";
import ManeuverPenaltiesService from "../core/maneuver_penalties_service.js";
import RollService from "./services/roll_service.js";
import WeaponFumbleService from "./services/weapon_fumble_service.js";
import FacingService from "./services/facing_service.js";
import { RMSSWeaponCriticalManager } from "./rmss_weapon_critical_manager.js";

export class RMSSWeaponSkillManager {

    static async handleAttack(actor, enemy, weapon, attackerToken = null, defenderToken = null) {
        const facingValue = (attackerToken && defenderToken)
            ? FacingService.calculateFacing(attackerToken, defenderToken)
            : null;
        const tokenData = facingValue !== null ? { facingValue } : null;
        const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemy, weapon, tokenData);
        if (!gmResponse.confirmed) return;
        const rollData = await RollService.highOpenEndedD100();
        const baseAttack = rollData.roll.terms[0].results[0].result;

        // Fumble check FIRST: if roll <= fumble_range, it's a fumble (weapon fumble table)
        const fumbleRange = weapon.type === "weapon" ? weapon.system.fumble_range : null;
        if (WeaponFumbleService.isFumble(baseAttack, fumbleRange ?? "")) {
            await RMSSWeaponCriticalManager.getWeaponFumbleMessage(actor, weapon, baseAttack, rollData.roll);
            return;
        }

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
        const criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(attackResult.damage, attackTable.critical_severity || null);
        // Fumble from attack table (result "F")
        if (criticalResult.criticals === "fumble") {
            const fumbleRoll = new Roll("1d100");
            await fumbleRoll.evaluate();
            if (game.dice3d) await game.dice3d.showForRoll(fumbleRoll, game.user, true);
            await RMSSWeaponCriticalManager.getWeaponFumbleMessage(actor, weapon, fumbleRoll.total, fumbleRoll);
            return;
        }

        // Critical not exists
        if (criticalResult.criticals.length === 0) {
            criticalResult.criticals = [
                { severity: null, critType: weapon.system.critical_type, damage: 0 }
            ];
            await RMSSWeaponCriticalManager.updateTokenOrActorHits(
                enemy,
                parseInt(criticalResult.damage)
            );
            if (actor.type === "character") {
                const { ExperienceManager } = await import("../sheets/experience/rmss_experience_manager.js");
                await ExperienceManager.applyExperience(actor, criticalResult.damage);
            }
        }

        await RMSSWeaponCriticalManager.getCriticalMessage(attackResult.damage, criticalResult, actor);
    }

    /**
     * Show confirm-attack modal. When spellOptions is provided (from BE spell), use pre-filled values instead of calculating.
     * @param {Actor} actor
     * @param {Actor} enemy
     * @param {Item} weapon
     * @param {Object} [spellOptions] - Pre-filled values from casting options: { ob, hitsTaken, bleeding, stunnedPenalty, penaltyValue, bonusValue }
     */
    static async attackMessagePopup(actor, enemy, weapon, spellOptionsOrTokenData = null) {
        // Get the real actor from the game if passed through socketlib
        const realActor = (actor.id && game.actors) ? game.actors.get(actor.id) : actor;
        if (!realActor) {
            console.error("[RMSS] Could not get the real actor", actor);
            return null;
        }

        let ob, hitsTaken, bleeding, penaltyValue, bonusValue, stunnedValue;
        const spellOptions = spellOptionsOrTokenData?.ob !== undefined ? spellOptionsOrTokenData : null;
        const tokenData = spellOptionsOrTokenData?.facingValue !== undefined ? spellOptionsOrTokenData : null;

        const realEnemy = (enemy?.id && game.actors) ? game.actors.get(enemy.id) : enemy;

        const facingValue = (tokenData?.facingValue ?? FacingService.FACING.FRONT) || "";

        if (spellOptions) {
            ob = spellOptions.ob ?? 0;
            hitsTaken = spellOptions.hitsTaken ?? 0;
            bleeding = spellOptions.bleeding ?? 0;
            penaltyValue = spellOptions.penaltyValue ?? 0;
            bonusValue = spellOptions.bonusValue ?? 0;
            const stunEffect = realEnemy ? Utils.getEffectByName(realEnemy, "Stunned") : [];
            stunnedValue = stunEffect.length > 0 && (stunEffect[0].duration?.rounds ?? 0) > 0;
        } else {
            const moveRatio = (realActor.system.attributes.movement_rate.current / realActor.system.attributes.movement_rate.value);
            if (moveRatio < 0.5) {
                ui.notifications.warn("Unable to attack (activity behind 50%)", {localize: true});
                return null;
            }
            ob = RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, realActor);
            const maneuverPenalties = ManeuverPenaltiesService.getManeuverPenalties(realActor);
            const { hitsTaken: ht, bleeding: bl, penaltyEffect } = maneuverPenalties;
            hitsTaken = ht;
            bleeding = bl;
            penaltyValue = Math.min(0, penaltyEffect);
            const bonusEffects = Utils.getEffectByName(realActor, "Bonus");
            const stunEffect = Utils.getEffectByName(enemy, "Stunned");
            bonusValue = 0;
            bonusEffects.forEach((bonus) => { bonusValue += bonus.flags.rmss.value; });
            bonusValue -= Math.round((1 - (realActor.system.attributes.movement_rate.current / realActor.system.attributes.movement_rate.value)) * 100);
            stunnedValue = stunEffect.length > 0 && (stunEffect[0].duration?.rounds ?? 0) > 0;
        }

        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-attack.hbs", {
            actor: realActor,
            enemy: realEnemy ?? enemy,
            weapon: weapon,
            ob: ob,
            hitsTaken,
            bleeding,
            bonusValue,
            stunnedValue,
            penaltyValue,
            facingValue,
        });

        let confirmed = await new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.confirm_attack"),
            content: htmlContent,
                buttons: {
                    confirm: {
                        label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
                        callback: (html) => {
                            const attackTotal = parseInt(html.find("#attack-total").val());
                            const defenseTotal = parseInt(html.find("#defense-total").val());
                            const diff = parseInt(html.find("#difference").val());
                            resolve({confirmed: true, attackTotal, defenseTotal, diff});
                        }
                    },
                    cancel: {
                        label: `❌ ${game.i18n.localize("rmss.combat.cancel")}`,
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
        // Handle creature_attack: they have bonus directly in system.bonus
        if (weapon.type === "creature_attack") {
            return weapon.system.bonus ?? 0;
        }
        
        // Handle weapon: they use offensive_skill to get bonus from a skill item
        const skillId = weapon.system.offensive_skill;
        if (!skillId || !actor.items) {
            return 0;
        }
        
        // Handle both Collection (with .get()) and Array (with .find())
        let skillItem;
        if (typeof actor.items.get === 'function') {
            // It's a Collection
            skillItem = actor.items.get(skillId);
        } else if (Array.isArray(actor.items)) {
            // It's an array
            skillItem = actor.items.find(item => item._id === skillId || item.id === skillId);
        } else {
            console.warn("[RMSS] actor.items is neither a Collection nor an Array", actor.items);
            return 0;
        }
        
        if (!skillItem) {
            return 0;
        }
        
        return skillItem.system.total_bonus ?? 0;
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