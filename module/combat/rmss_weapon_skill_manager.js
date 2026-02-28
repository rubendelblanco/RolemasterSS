import { socket } from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import Utils from "../utils.js";
import ManeuverPenaltiesService from "../core/maneuver_penalties_service.js";
import RollService from "./services/roll_service.js";
import WeaponFumbleService from "./services/weapon_fumble_service.js";
import FacingService from "./services/facing_service.js";
import { RMSSWeaponCriticalManager } from "./rmss_weapon_critical_manager.js";
import OBPersistenceService from "./services/ob_persistence_service.js";

const OB_STEP = 5;

export class RMSSWeaponSkillManager {

    static async handleAttack(actor, enemy, weapon, attackerToken = null, defenderToken = null) {
        const facingValue = (attackerToken && defenderToken)
            ? FacingService.calculateFacing(attackerToken, defenderToken)
            : null;
        let tokenData = facingValue !== null ? { facingValue } : {};

        // Rotate attacker token to face the defender
        if (attackerToken && defenderToken) {
            const rotation = FacingService.getRotationToFaceTarget(attackerToken, defenderToken);
            if (rotation !== null) {
                const doc = attackerToken.document ?? attackerToken;
                try {
                    await doc.update({ rotation });
                } catch (e) {
                    console.warn("[RMSS] Could not rotate attacker token:", e);
                }
            }
        }

        let attackerObUsed = null;
        const attackerHasPlayer = game.users.some(u => !u.isGM && actor.testUserPermission?.(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
        if (attackerHasPlayer) {
            const fullOB = RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, actor);
            const combat = game.combat;
            const attackerCombatantId = combat ? OBPersistenceService.getCombatantIdForActor(combat, actor) : null;
            const obUsed = attackerCombatantId ? OBPersistenceService.getObUsed(combat, attackerCombatantId) : 0;
            const availableOB = Math.max(0, fullOB - obUsed);
            if (availableOB > 0) {
                attackerObUsed = await RMSSWeaponSkillManager._showAttackerOBModal(availableOB, fullOB, obUsed);
                if (attackerObUsed === null) return;
                // addObUsed is done on GM side in attackMessagePopup (player lacks Combat update permission)
            }
            tokenData = { ...tokenData, attackerObUsed: attackerObUsed ?? 0 };
        }
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
        const tokenData = !spellOptions && spellOptionsOrTokenData ? spellOptionsOrTokenData : null;

        const realEnemy = (enemy?.id && game.actors) ? game.actors.get(enemy.id) : enemy;

        const facingValue = (tokenData?.facingValue ?? FacingService.FACING.FRONT) ?? "";

        let attackerParryValue = 0;
        let targetParryValue = 0;

        const combat = game.combat;

        // Persist attacker OB used (runs on GM; player lacks Combat update permission)
        if (tokenData?.attackerObUsed !== undefined && tokenData.attackerObUsed > 0 && combat) {
            const attackerCombatantId = OBPersistenceService.getCombatantIdForActor(combat, realActor);
            if (attackerCombatantId) {
                await OBPersistenceService.addObUsed(combat, attackerCombatantId, tokenData.attackerObUsed);
            }
        }

        // When attacker chose OB: show full OB and parry reserved (fullOB - used). Parry subtracts from total.
        if (tokenData?.attackerObUsed !== undefined && tokenData.attackerObUsed > 0) {
            const fullOB = RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, realActor);
            attackerParryValue = Math.max(0, fullOB - tokenData.attackerObUsed); // reserved for parry (positive for display)
        }

        const defenderHasPlayer = realEnemy && game.users.some(u => !u.isGM && realEnemy.testUserPermission?.(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
        const defenderCombatantId = combat && realEnemy ? OBPersistenceService.getCombatantIdForActor(combat, realEnemy) : null;
        let defenderParryAlreadyPersisted = false;

        if (defenderHasPlayer && !spellOptions) {
            const defenderObUsed = defenderCombatantId ? OBPersistenceService.getObUsed(combat, defenderCombatantId) : 0;
            const maxParryOB = RMSSWeaponSkillManager._getMaxParryOB(realEnemy);
            const availableParry = Math.max(0, maxParryOB - defenderObUsed);
            const defenderUser = game.users.find(u => !u.isGM && realEnemy.testUserPermission?.(u, CONST.DOCUMENT_OWNERSHIP_LEVELS.OWNER));
            if (defenderUser?.active && availableParry > 0) {
                targetParryValue = await socket.executeAsUser("showParryModal", defenderUser.id, availableParry);
                if (targetParryValue === null) return null;
                if (combat && defenderCombatantId) {
                    await OBPersistenceService.addObUsed(combat, defenderCombatantId, targetParryValue);
                    defenderParryAlreadyPersisted = true;
                }
            }
        }

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
            ob = tokenData?.attackerObUsed !== undefined
                ? RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, realActor) // full OB; parry reserved subtracts
                : RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(weapon, realActor);
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
            attackerParryValue: attackerParryValue ?? 0,
            targetParryValue: targetParryValue ?? 0,
        });

        let confirmed = await new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.confirm_attack"),
            content: htmlContent,
                buttons: {
                    confirm: {
                        label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
                        callback: async (html) => {
                            const attackTotal = parseInt(html.find("#attack-total").val());
                            const defenseTotal = parseInt(html.find("#defense-total").val());
                            const diff = parseInt(html.find("#difference").val());
                            const targetParryFromForm = parseInt(html.find("#target-parry").val()) || 0;
                            if (!defenderParryAlreadyPersisted && combat && defenderCombatantId && targetParryFromForm > 0) {
                                await OBPersistenceService.addObUsed(combat, defenderCombatantId, targetParryFromForm);
                            }
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
                            const val = this.type === "checkbox"
                                ? (this.checked ? parseInt(this.value) || 0 : 0)
                                : (this.type === "select-one" ? parseInt(this.value) || 0 : parseInt(this.value) || 0);
                            total += this.dataset.subtract === "true" ? -val : val;
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
                    html.find("#attacker-parry[data-subtract]").on("change", (event) => {
                        const v = parseInt(event.target.value) || 0;
                        if (v < 0) event.target.value = 0;
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

    /**
     * Modal para que el atacante (jugador) elija cuánto OB usar en el ataque.
     * @param {number} availableOB - OB disponible (fullOB - obUsed)
     * @param {number} fullOB - OB total del arma
     * @param {number} obUsed - OB ya gastado este round
     * @returns {Promise<number|null>} OB usado o null si cancela
     */
    static async _showAttackerOBModal(availableOB, fullOB, obUsed) {
        const step = OB_STEP;
        const maxVal = Math.floor(availableOB / step) * step;
        const options = [];
        for (let v = 0; v <= maxVal; v += step) options.push(v);
        const defaultVal = Math.min(availableOB, Math.max(0, options[options.length - 1] ?? 0));

        const content = `
            <div class="form-group">
                <label>${game.i18n.localize("rmss.combat.ob_available")}: <strong>${availableOB}</strong></label>
                <p>${game.i18n.localize("rmss.combat.ob_for_attack")}:</p>
                <input type="range" id="ob-attack-slider" min="0" max="${maxVal}" step="${step}" value="${defaultVal}" 
                       style="width:100%;">
                <div style="text-align:center; margin-top:8px;">
                    <strong id="ob-attack-value">${defaultVal}</strong>
                </div>
            </div>
        `;

        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.ob_for_attack"),
                content,
                buttons: {
                    confirm: {
                        label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
                        callback: (html) => resolve(parseInt(html.find("#ob-attack-slider").val()) || 0)
                    },
                    cancel: {
                        label: `❌ ${game.i18n.localize("rmss.combat.cancel")}`,
                        callback: () => resolve(null)
                    }
                },
                default: "confirm",
                render: (html) => {
                    const slider = html.find("#ob-attack-slider");
                    const display = html.find("#ob-attack-value");
                    slider.on("input", () => display.text(parseInt(slider.val()) || 0));
                }
            }).render(true);
        });
    }

    /**
     * Modal para que el defensor (jugador) elija cuánto OB usar para parar.
     * Se ejecuta en el cliente del defensor vía socket.executeAsUser.
     * @param {number} maxParryOB - OB máximo disponible para parar
     * @returns {Promise<number|null>} OB para parar o null si cancela
     */
    static async showParryModal(maxParryOB) {
        const step = OB_STEP;
        const maxVal = Math.max(0, Math.floor(maxParryOB / step) * step);
        const defaultVal = Math.min(maxParryOB, maxVal);

        const content = `
            <div class="form-group">
                <label>${game.i18n.localize("rmss.combat.ob_available")}: <strong>${maxParryOB}</strong></label>
                <p>${game.i18n.localize("rmss.combat.ob_parry_defender")}:</p>
                <input type="range" id="ob-parry-slider" min="0" max="${maxVal}" step="${step}" value="${defaultVal}" 
                       style="width:100%;">
                <div style="text-align:center; margin-top:8px;">
                    <strong id="ob-parry-value">${defaultVal}</strong>
                </div>
            </div>
        `;

        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.combat.ob_parry_defender"),
                content,
                buttons: {
                    confirm: {
                        label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
                        callback: (html) => resolve(parseInt(html.find("#ob-parry-slider").val()) || 0)
                    },
                    cancel: {
                        label: `❌ ${game.i18n.localize("rmss.combat.cancel")}`,
                        callback: () => resolve(null)
                    }
                },
                default: "confirm",
                render: (html) => {
                    const slider = html.find("#ob-parry-slider");
                    const display = html.find("#ob-parry-value");
                    slider.on("input", () => display.text(parseInt(slider.val()) || 0));
                }
            }).render(true);
        });
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

    /** Obtiene el OB máximo para parar (mayor OB de armas del actor). */
    static _getMaxParryOB(actor) {
        if (!actor?.items) return 0;
        let max = 0;
        const items = Array.isArray(actor.items) ? actor.items : Array.from(actor.items ?? []);
        for (const item of items) {
            if (["weapon", "creature_attack"].includes(item.type)) {
                const ob = RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(item, actor);
                if (ob > max) max = ob;
            }
        }
        return max;
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