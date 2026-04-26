/**
 * Service for Directed Elemental (DE) spell casting.
 * DE spells use a directed spell skill (category slug "directed-spells"), bolt attack tables only,
 * and resolve as attacks similar to BE spells.
 */
import CastingOptionsService from "./casting_options_service.js";
import SpellFailureService from "./spell_failure_service.js";
import { triggerAutoAnimations, getActorToken } from "../../autoanimations_integration.js";
import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage, withPublicRollMode } from "../../chat/chatMessages.js";
import RMSSTableManager from "../../combat/rmss_table_manager.js";
import { RMSSWeaponCriticalManager } from "../../combat/rmss_weapon_critical_manager.js";
import FacingService from "../../combat/services/facing_service.js";
import { ExperienceManager } from "../../sheets/experience/rmss_experience_manager.js";
import { socket } from "../../../rmss.js";
import { CombatHistoryTracker } from "../../combat/combat_history_tracker.js";
import { getMatchingSpellAdder, consumeSpellAdderUse, validatePpForSpellCastAfterDialog } from "../../actors/utils/power_points_util.js";
import Utils from "../../utils.js";

export default class DirectedElementalSpellService {

    /**
     * Cast a DE (Directed Elemental) spell.
     * Flow: PP check → casting options → roll → resolve attack table (bolt only) → per-target resolution
     * @param {Object} params
     * @param {Actor} params.actor - The caster
     * @param {Item} params.spell - The DE spell
     * @param {string} params.spellListName - Name of the spell list (for context)
     * @param {string} params.spellListRealm - Realm of the spell list
     */
    static async castDirectedElementalSpell({ actor, spell, spellListName, spellListRealm, consumePowerPoints = true, fromEnchantment = false, enchantmentAttackBonus = 0 }) {
        const attackTableName = spell.system?.attack_table;
        if (!attackTableName || !CONFIG.rmss?.boltTables?.includes(attackTableName)) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.de_no_attack_table"));
            return;
        }

        const skillName = spell.system?.skillName;
        const isCreature = actor.type === "creature";
        // Characters and NPCs need a skill (unless from enchantment); creatures don't have skills
        if (!fromEnchantment && !isCreature && !skillName) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.de_no_skill"));
            return;
        }

        const spellLevel = spell.system?.level ?? 1;
        let noPP = !consumePowerPoints || spell.system?.no_pp === true;
        let spellAdder = null;
        if (!noPP) {
            spellAdder = getMatchingSpellAdder(actor);
            const currentPP = parseInt(actor.system.attributes?.power_points?.current ?? 0);
            if (currentPP < spellLevel && !spellAdder) {
                ui.notifications.warn(
                    game.i18n.format("rmss.spells.insufficient_power", {
                        actorName: actor.name,
                        spellName: spell.name
                    })
                );
                return;
            }
        }

        // OB: from enchantment use skill if developed (manual exception); otherwise skill for characters, creature_attack for creatures
        let skillBonus;
        let displaySkillName;
        if (isCreature && skillName) {
            const creatureAttack = actor.items.find(i =>
                i.type === "creature_attack" && i.name === skillName
            );
            skillBonus = creatureAttack ? parseInt(creatureAttack.system?.bonus ?? 0, 10) : 0;
            displaySkillName = skillName;
        } else {
            const skill = skillName ? actor.items.find(i =>
                i.type === "skill" &&
                i.system?.categorySlug === "directed-spells" &&
                i.name === skillName
            ) : null;
            skillBonus = skill?.system?.total_bonus ?? 0;
            displaySkillName = skillName || (isCreature ? game.i18n.localize("rmss.spells.de_creature_cast") : (fromEnchantment ? (spellListName || spell.name || "") : ""));
        }

        const effectiveRealm = spellListRealm || actor.system.fixed_info?.realm || "essence";
        const castingOptions = await CastingOptionsService.showCastingOptionsDialog({
            realm: effectiveRealm,
            spellType: "DE",
            spellName: spell.name,
            actor,
            spellAdderItemName: spellAdder?.item?.name ?? null,
            spellAdderUsesRemaining: spellAdder?.usesRemaining ?? 0,
            spellAdderUsesMax: spellAdder?.value ?? 0,
            spellLevel,
            spendPp: !noPP
        });

        if (castingOptions === null) return;
        if (castingOptions.useSpellAdder) {
            noPP = true;
            if (spellAdder?.item) await consumeSpellAdderUse(spellAdder.item);
        }
        if (!validatePpForSpellCastAfterDialog(actor, spell, spellLevel, noPP)) {
            return;
        }

        const targets = Array.from(game.user.targets);
        if (targets.length === 0) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.de_no_targets"));
            return;
        }

        const castingModifier = castingOptions.castingModifier ?? castingOptions.totalModifier;
        const { hitsTaken = 0, bleeding = 0, penaltyEffect = 0 } = castingOptions;
        const totalCastingModifier = castingOptions.totalModifier;

        const penaltyValue = Math.min(0, penaltyEffect);
        const restModifier = totalCastingModifier - hitsTaken - bleeding - penaltyValue;
        const virtualWeapon = { type: "spell", system: { attack_table: attackTableName } };
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
            ob: skillBonus + enchantmentAttackBonus,
            hitsTaken,
            bleeding,
            penaltyValue,
            bonusValue: restModifier,
            ...(facingValue !== null && { facingValue })
        };

        if (Utils.isTargetDefeated(enemyActor)) {
            ui.notifications.warn(game.i18n.localize("rmss.combat.target_already_defeated"));
            return;
        }

        if (!game.user.isGM) {
            ui.notifications.info(game.i18n.localize("rmss.combat.awaiting_gm_confirmation"));
        }
        const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemyActor, virtualWeapon, spellOptions);
        if (!gmResponse?.confirmed) return;

        const diff = gmResponse.diff ?? 0;

        const roll = await new Roll("1d100x>95").evaluate();
        const naturalRoll = roll.dice[0].results[0].result;
        const rollTotal = naturalRoll === 100 ? 100 : roll.total;

        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
        }

        if (!noPP) {
            const currentPP = parseInt(actor.system.attributes?.power_points?.current ?? 0);
            const newPP = Math.max(0, currentPP - spellLevel);
            await actor.update({ "system.attributes.power_points.current": newPP });
        }

        const finalResult = naturalRoll + diff;

        const attackTable = await RMSSTableManager.loadAttackTable(attackTableName);
        if (!attackTable) {
            ui.notifications.error(`Attack table not found: ${attackTableName}`);
            return;
        }

        const maximum = await RMSSTableManager.getAttackTableMaxResult(virtualWeapon);
        const umResult = RMSSTableManager.findUnmodifiedAttack(attackTableName, naturalRoll, attackTable);
        const isUm = umResult != null;
        const clamps = RMSSTableManager.getSpellModifiedClamps(attackTable, maximum);
        const baseEnergy = isUm
            ? umResult.attack
            : Math.min(Math.max(finalResult, clamps.min), clamps.max);

        const armorTypeForFCheck = 1;
        const fCheckRow = RMSSTableManager.findAttackTableRow(attackTableName, attackTable, baseEnergy);
        const fCheckDamage = fCheckRow?.[String(armorTypeForFCheck)];
        const isGlobalFumble = fCheckDamage === "F";

        if (isGlobalFumble) {
            const failureResult = await SpellFailureService.rollFailure("DE", "spectacular_failure", totalCastingModifier);
            await this._createChatMessage({
                actor,
                spell,
                skillName: displaySkillName,
                skillBonus,
                castingModifier,
                hitsTaken,
                bleeding,
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
            skillName: displaySkillName,
            skillBonus,
            castingModifier,
            hitsTaken,
            bleeding,
            penaltyEffect,
            naturalRoll,
            rollTotal,
            finalResult,
            baseEnergy,
            isUm,
            failureResult: null,
            isSpellFailure: false
        });

        for (let i = 0; i < targets.length; i++) {
            const target = targets[i];
            const targetActor = target.actor;
            if (!targetActor?.system?.armor_info) continue;

            const targetDefense = parseInt(targetActor.system.armor_info?.total_db ?? 0) || 0;
            const areaPenalty = i === 0 ? 0 : 20;
            let finalForTarget = baseEnergy - targetDefense - areaPenalty;
            finalForTarget = RMSSTableManager.capSpellDamageLookupIndex(
                finalForTarget,
                isUm,
                maximum,
                attackTable
            );

            const attackResult = await RMSSTableManager.getAttackTableResult(
                virtualWeapon,
                attackTable,
                finalForTarget,
                targetActor,
                actor
            );

            const isNullResult = attackResult.damage === "-" || attackResult.damage === 0 || attackResult.damage === "0" || attackResult.damage == null;
            if (isNullResult) continue;

            let criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(
                attackResult.damage,
                attackTable.critical_severity || null
            );
            criticalResult = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(criticalResult, targetActor);

            if (criticalResult.criticals === "fumble") continue;

            if (!RMSSWeaponCriticalManager.hasResolvableCriticalForChat(criticalResult)) {
                const damageToApply = parseInt(criticalResult.damage);
                if (!isNaN(damageToApply) && damageToApply > 0) {
                    await RMSSWeaponCriticalManager.updateTokenOrActorHits(targetActor, damageToApply, actor.id);
                    if (actor.type === "character") {
                        await ExperienceManager.applyExperience(actor, criticalResult.damage);
                    }
                }
                await RMSSWeaponCriticalManager.getHpOnlyDamageMessage(
                    attackResult.damage,
                    criticalResult,
                    actor,
                    target
                );
                continue;
            }

            await RMSSWeaponCriticalManager.getCriticalMessage(attackResult.damage, criticalResult, actor, target, false);
        }

        let spellXp = 0;
        if (actor.type === "character") {
            const casterLevel = actor.system.attributes?.level?.value ?? 1;
            const xp = ExperiencePointsCalculator.calculateSpellExpPoints(casterLevel, spellLevel);
            if (xp > 0) {
                spellXp = xp;
                const totalExpActor = parseInt(actor.system.attributes.experience_points.value) + xp;
                await actor.update({ "system.attributes.experience_points.value": totalExpActor });
                const breakDown = { maneuver: 0, spell: xp, critical: 0, kill: 0, bonus: 0, misc: 0 };
                await sendExpMessage(actor, breakDown, xp);
            }
        }

        if (game.combat?.started) {
            CombatHistoryTracker.get().recordSpellCast(actor.id, spellLevel, spellXp);
        }

        const sourceToken = getActorToken(actor);
        if (sourceToken) {
            triggerAutoAnimations(sourceToken, spell, targets);
        }

        await spell.use();
    }

    static async _createChatMessage({
        actor,
        spell,
        skillName,
        skillBonus,
        castingModifier,
        hitsTaken = 0,
        bleeding = 0,
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
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000; display: flex; align-items: center; gap: 6px;">
                            <img src="${spell.img || 'icons/svg/dice-target.svg'}" alt="" width="24" height="24" style="border-radius: 4px; flex-shrink: 0;">
                            ${spell.name} (DE)
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${skillName} — ${game.i18n.localize("rmss.spells.cast_result")}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff;">
                    <div>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${naturalRoll}</strong>${isExplosive ? ` → <strong style="color: orange;">${rollTotal}</strong> 💥` : ""}</div>
                    ${!isUm ? `<div>📊 ${game.i18n.localize("rmss.spells.skill")}: <strong>${formatMod(skillBonus)}</strong></div><div>🎯 Casting: <strong>${formatMod(castingModifier)}</strong></div>${hitsTaken !== 0 ? `<div>💔 ${game.i18n.localize("rmss.combat.hits_taken")}: <strong>${formatMod(hitsTaken)}</strong></div>` : ""}${bleeding !== 0 ? `<div>🩸 ${game.i18n.localize("rmss.maneuvers.bleeding")}: <strong>${formatMod(bleeding)}</strong></div>` : ""}${penaltyEffect !== 0 ? `<div>🩹 ${game.i18n.localize("rmss.combat.penalty")}: <strong>${formatMod(Math.min(0, penaltyEffect))}</strong></div>` : ""}<div>📈 Total: <strong>${finalResult}</strong></div>` : `<div><em style="color:#aaa;">${game.i18n.localize("rmss.spells.unmodified")}</em></div>`}
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

        await ChatMessage.create(withPublicRollMode({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        }));
    }
}
