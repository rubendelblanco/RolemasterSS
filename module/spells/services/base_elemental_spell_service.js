/**
 * Service for Base Elemental (BE) spell casting.
 * BE spells use the spell list bonus, different modifiers, and resolve as attacks
 * using the attack tables (fire_ball, ice_bolt, etc.) instead of Static Maneuver.
 */
import CastingOptionsService from "./casting_options_service.js";
import SpellFailureService from "./spell_failure_service.js";
import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage } from "../../chat/chatMessages.js";
import RMSSTableManager from "../../combat/rmss_table_manager.js";
import { RMSSWeaponCriticalManager } from "../../combat/rmss_weapon_critical_manager.js";
import FacingService from "../../combat/services/facing_service.js";
import { ExperienceManager } from "../../sheets/experience/rmss_experience_manager.js";
import { socket } from "../../../rmss.js";

export default class BaseElementalSpellService {

    /**
     * Cast a BE (Base Elemental) spell.
     * Flow: PP check → casting options → roll → resolve attack table (with UM) → if result F: Spell Failure | else: attack resolution per target
     * @param {Object} params
     * @param {Actor} params.actor - The caster
     * @param {Item} params.spell - The BE spell
     * @param {string} params.spellListName - Name of the spell list (for skill bonus)
     * @param {string} params.spellListRealm - Realm of the spell list
     */
    static async castBaseElementalSpell({ actor, spell, spellListName, spellListRealm }) {
        const attackTableName = spell.system?.attack_table;
        if (!attackTableName) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.be_no_attack_table"));
            return;
        }

        const spellLevel = spell.system?.level ?? 1;
        const currentPP = parseInt(actor.system.attributes?.power_points?.current ?? 0);
        if (currentPP < spellLevel) {
            ui.notifications.warn(
                game.i18n.format("rmss.spells.insufficient_power", {
                    actorName: actor.name,
                    spellName: spell.name
                })
            );
            return;
        }

        const effectiveRealm = spellListRealm || actor.system.fixed_info?.realm || "essence";
        const castingOptions = await CastingOptionsService.showCastingOptionsDialog({
            realm: effectiveRealm,
            spellType: "BE",
            spellName: spell.name,
            actor
        });

        if (castingOptions === null) return;

        const targets = Array.from(game.user.targets);
        if (targets.length === 0) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.be_no_targets"));
            return;
        }

        // If no skill associated with spell list, use 0
        const skill = actor.items.find(i => i.type === "skill" && i.name === spellListName);
        const skillBonus = skill?.system?.total_bonus ?? 0;
        const castingModifier = castingOptions.castingModifier ?? castingOptions.totalModifier;
        const { hitsTaken = 0, bleeding = 0, stunned = 0, penaltyEffect = 0 } = castingOptions;
        const totalCastingModifier = castingOptions.totalModifier;

        const penaltyValue = Math.min(0, penaltyEffect);
        const restModifier = totalCastingModifier - hitsTaken - bleeding - penaltyValue;
        const virtualWeapon = { type: "spell", system: { attack_table: spell.system?.attack_table } };
        const firstTarget = targets[0];
        const enemyActor = firstTarget.actor;
        if (!enemyActor?.system?.armor_info) {
            ui.notifications.warn("Target must have armor info for attack confirmation.");
            return;
        }

        const casterToken = canvas.tokens.controlled.find(t => t.actor?.id === actor.id) ?? actor.getActiveTokens?.()?.[0];
        const defenderToken = firstTarget;
        const facingValue = (casterToken && defenderToken) ? FacingService.calculateFacing(casterToken, defenderToken) : null;

        // Rotate caster token to face the target
        if (casterToken && defenderToken) {
            const rotation = FacingService.getRotationToFaceTarget(casterToken, defenderToken);
            if (rotation !== null) {
                const doc = casterToken.document ?? casterToken;
                try {
                    await doc.update({ rotation });
                } catch (e) {
                    console.warn("[RMSS] Could not rotate caster token:", e);
                }
            }
        }

        const spellOptions = {
            ob: skillBonus,
            hitsTaken,
            bleeding,
            penaltyValue,
            bonusValue: restModifier,
            ...(facingValue !== null && { facingValue })
        };

        const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemyActor, virtualWeapon, spellOptions);
        if (!gmResponse?.confirmed) return;

        const diff = gmResponse.diff ?? 0;

        const roll = await new Roll("1d100x>95").evaluate();
        const naturalRoll = roll.dice[0].results[0].result;
        const rollTotal = naturalRoll === 100 ? 100 : roll.total;

        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
        }

        const newPP = Math.max(0, currentPP - spellLevel);
        await actor.update({ "system.attributes.power_points.current": newPP });

        const finalResult = naturalRoll + diff;

        const attackTable = await RMSSTableManager.loadAttackTable(attackTableName);
        if (!attackTable) {
            ui.notifications.error(`Attack table not found: ${attackTableName}`);
            return;
        }

        // Apply UM from attack table (01-04, 96-97, 98-99, 100-100 in fire_ball, etc.)
        // This is the "Energy Potential" - single roll for all targets
        const maximum = await RMSSTableManager.getAttackTableMaxResult(virtualWeapon);
        const umResult = RMSSTableManager.findUnmodifiedAttack(attackTableName, naturalRoll, attackTable);
        const isUm = umResult != null;
        const baseEnergy = isUm ? umResult.attack : Math.min(Math.max(finalResult, 1), maximum);

        // Check for global Fumble (F): only when base roll is in F range - affects everyone
        const armorTypeForFCheck = 1;
        const fCheckRow = RMSSTableManager.findAttackTableRow(attackTableName, attackTable, baseEnergy);
        const fCheckDamage = fCheckRow?.[String(armorTypeForFCheck)];
        const isGlobalFumble = fCheckDamage === "F";

        if (isGlobalFumble) {
            const failureResult = await SpellFailureService.rollFailure("BE", "spectacular_failure", totalCastingModifier);
            await this._createChatMessage({
                actor,
                spell,
                spellListName,
                skillBonus,
                castingModifier,
                hitsTaken,
                bleeding,
                stunned,
                penaltyEffect,
                naturalRoll,
                rollTotal,
                finalResult,
                baseEnergy,
                isUm,
                failureResult,
                isSpellFailure: true
            });
            return;
        }

        await this._createChatMessage({
            actor,
            spell,
            spellListName,
            skillBonus,
            castingModifier,
            hitsTaken,
            bleeding,
            stunned,
            penaltyEffect,
            naturalRoll,
            rollTotal,
            finalResult,
            baseEnergy,
            isUm,
            failureResult: null,
            isSpellFailure: false
        });

        // Per-target resolution: baseEnergy - (target defense) - 20 for non-central targets
        const CENTRAL_TARGET_PENALTY = 0;
        const AREA_TARGET_PENALTY = 20;

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const enemyActor = target.actor;
            if (!enemyActor?.system?.armor_info) continue;

            const targetDefense = parseInt(enemyActor.system.armor_info?.total_db ?? 0) || 0;
            const areaPenalty = i === 0 ? CENTRAL_TARGET_PENALTY : AREA_TARGET_PENALTY;
            let finalForTarget = baseEnergy - targetDefense - areaPenalty;
            finalForTarget = Math.max(1, Math.min(finalForTarget, maximum));

            const attackResult = await RMSSTableManager.getAttackTableResult(
                virtualWeapon,
                attackTable,
                finalForTarget,
                enemyActor,
                actor
            );

            if (!attackResult.damage) continue;

            const criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(
                attackResult.damage,
                attackTable.critical_severity || null
            );

            // Per-target F (high defense): spell had no effect on this target, skip
            if (criticalResult.criticals === "fumble") continue;

            if (criticalResult.criticals.length === 0) {
                const critType = attackTable.critical_severity?.default || "heat";
                criticalResult.criticals = [{ severity: null, critType, damage: 0 }];
                await RMSSWeaponCriticalManager.updateTokenOrActorHits(target.actor ?? target, parseInt(criticalResult.damage));
                if (actor.type === "character") {
                    await ExperienceManager.applyExperience(actor, criticalResult.damage);
                }
            }

            await RMSSWeaponCriticalManager.getCriticalMessage(attackResult.damage, criticalResult, actor, target);
        }

        // Award spell XP on success
        if (actor.type === "character") {
            const casterLevel = actor.system.attributes?.level?.value ?? 1;
            const xp = ExperiencePointsCalculator.calculateSpellExpPoints(casterLevel, spellLevel);
            if (xp > 0) {
                const totalExpActor = parseInt(actor.system.attributes.experience_points.value) + xp;
                await actor.update({ "system.attributes.experience_points.value": totalExpActor });
                const breakDown = { maneuver: 0, spell: xp, critical: 0, kill: 0, bonus: 0, misc: 0 };
                await sendExpMessage(actor, breakDown, xp);
            }
        }

        // Execute spell macro on success (via item.use: item, actor, token)
        await spell.use();
    }

    static async _createChatMessage({
        actor,
        spell,
        spellListName,
        skillBonus,
        castingModifier,
        hitsTaken = 0,
        bleeding = 0,
        stunned = 0,
        penaltyEffect = 0,
        naturalRoll,
        rollTotal,
        finalResult,
        baseEnergy,
        isUm,
        failureResult,
        isSpellFailure
    }) {
        const formatMod = (n) => (n >= 0 ? `+${n}` : `${n}`);
        const isExplosive = rollTotal !== naturalRoll;

        let content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${actor.img}" alt="${actor.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000;">
                            ⚡ ${spell.name} (BE)
                        </h4>
                        <div style="font-size: 0.9em; color: #ccc;">
                            ${spellListName} — ${game.i18n.localize("rmss.spells.cast_result")}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #ddd;">
                    <div>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${naturalRoll}</strong>${isExplosive ? ` → <strong style="color: orange;">${rollTotal}</strong> 💥` : ""}</div>
                    ${!isUm ? `<div>📊 ${game.i18n.localize("rmss.spells.skill")}: <strong>${formatMod(skillBonus)}</strong></div><div>🎯 Casting: <strong>${formatMod(castingModifier)}</strong></div>${hitsTaken !== 0 ? `<div>💔 ${game.i18n.localize("rmss.combat.hits_taken")}: <strong>${formatMod(hitsTaken)}</strong></div>` : ""}${bleeding !== 0 ? `<div>🩸 ${game.i18n.localize("rmss.maneuvers.bleeding")}: <strong>${formatMod(bleeding)}</strong></div>` : ""}${stunned !== 0 ? `<div>😵 ${game.i18n.localize("rmss.maneuvers.stunned")}: <strong>${formatMod(stunned)}</strong></div>` : ""}${penaltyEffect !== 0 ? `<div>🩹 ${game.i18n.localize("rmss.combat.penalty")}: <strong>${formatMod(Math.min(0, penaltyEffect))}</strong></div>` : ""}<div>📈 Total: <strong>${finalResult}</strong></div>` : `<div><em style="color:#aaa;">${game.i18n.localize("rmss.spells.unmodified")}</em></div>`}
                    <div>📊 ${game.i18n.localize("rmss.spells.table_result")}: <strong>${baseEnergy}</strong></div>
                </div>
        `;

        if (isSpellFailure && failureResult) {
            const multiplierText = failureResult.multiplier > 1 ? ` (×${failureResult.multiplier})` : "";
            content += `
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div class="spell-failure-result">
                    <h4>⚠️ ${game.i18n.localize("rmss.spells.spell_failure_roll")}</h4>
                    <div class="failure-roll-details">
                        <p>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${failureResult.naturalRoll}</strong></p>
                        <p>📊 ${game.i18n.localize("rmss.spells.casting_penalty")}: <strong>${formatMod(failureResult.modifierPenalty)}</strong>${multiplierText}</p>
                        <p>📈 Total: <strong>${failureResult.finalResult}</strong></p>
                    </div>
                    <div class="failure-description"><p>${failureResult.description}</p></div>
                </div>
            `;
        } else if (!isSpellFailure) {
            content += `
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div class="spell-maneuver-result result-success">
                    <p class="maneuver-name"><strong>${game.i18n.localize("rmss.spells.be_attack_resolved")}</strong></p>
                </div>
            `;
        }

        content += `</div>`;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
    }
}
