/**
 * Service for Base Elemental (BE) spell casting.
 * BE spells use the spell list bonus, different modifiers, and resolve as attacks
 * using the attack tables (fire_ball, ice_bolt, etc.) instead of Static Maneuver.
 */
import CastingOptionsService from "./casting_options_service.js";
import SpellFailureService from "./spell_failure_service.js";
import { triggerAutoAnimations, getActorToken } from "../../autoanimations_integration.js";
import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage, withPublicRollMode, chatMessageOtherStyle } from "../../chat/chatMessages.js";
import RMSSTableManager from "../../combat/rmss_table_manager.js";
import { RMSSWeaponCriticalManager } from "../../combat/rmss_weapon_critical_manager.js";
import FacingService from "../../combat/services/facing_service.js";
import { ExperienceManager } from "../../sheets/experience/rmss_experience_manager.js";
import { socket } from "../../../rmss.js";
import { CombatHistoryTracker } from "../../combat/combat_history_tracker.js";
import { getMatchingSpellAdder, consumeSpellAdderUse, validatePpForSpellCastAfterDialog } from "../../actors/utils/power_points_util.js";
import Utils from "../../utils.js";
import {
    getLatestCircleTemplateForUser,
    getTokensInsideTemplate,
    getCircleEpicenter,
    getCircleRadiusInGridUnits,
    sortTokensByEpicenter,
    isTokenAtEpicenter,
    getAreaDefenseDb
} from "../../combat/services/area_spell_resolution_service.js";

export default class BaseElementalSpellService {

    /**
     * Cast a BE (Base Elemental) spell.
     * Flow: PP check → casting options → roll → resolve attack table (with UM) → if result F: Spell Failure | else: attack resolution per target
     * @param {Object} params
     * @param {Actor} params.actor - The caster
     * @param {Item} params.spell - The BE spell
     * @param {string} params.spellListName - Name of the spell list (for skill bonus)
     * @param {string} params.spellListRealm - Realm of the spell list
     * @returns {Promise<boolean>} true once the cast actually committed (PP spent / dice rolled),
     *   including a spell-failure outcome — false if it aborted before that point (missing attack
     *   table, insufficient PP, dialog cancelled, no targets/area template, GM didn't confirm...).
     *   Callers that consume a one-shot resource (e.g. a potion, see castEnchantmentFromItem)
     *   should only do so when this returns true.
     */
    static async castBaseElementalSpell({ actor, spell, spellListName, spellListRealm, consumePowerPoints = true, fromEnchantment = false, enchantmentAttackBonus = 0 }) {
        const attackTableName = spell.system?.attack_table;
        if (!attackTableName) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.be_no_attack_table"));
            return false;
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
                return false;
            }
        }

        const effectiveRealm = spellListRealm || actor.system.fixed_info?.realm || "essence";
        const castingOptions = await CastingOptionsService.showCastingOptionsDialog({
            realm: effectiveRealm,
            spellType: "BE",
            spellName: spell.name,
            actor,
            spellAdderItemName: spellAdder?.item?.name ?? null,
            spellAdderUsesRemaining: spellAdder?.usesRemaining ?? 0,
            spellAdderUsesMax: spellAdder?.value ?? 0,
            spellLevel,
            spendPp: !noPP,
            fromEnchantment
        });

        if (castingOptions === null) return false;
        if (castingOptions.useSpellAdder) {
            noPP = true;
            if (spellAdder?.item) await consumeSpellAdderUse(spellAdder.item);
        }
        if (!validatePpForSpellCastAfterDialog(actor, spell, spellLevel, noPP)) {
            return false;
        }

        const isBallSpell = Array.isArray(CONFIG.rmss?.ballTables) && CONFIG.rmss.ballTables.includes(attackTableName);

        // Skill bonus: from enchantment always 0; otherwise from skill for characters, spell maneuver modifier for creatures/NPCs
        let skillBonus;
        if (fromEnchantment) {
            skillBonus = 0;
        } else {
            const skill = actor.items.find(i => i.type === "skill" && i.name === spellListName);
            if (skill) {
                skillBonus = skill.system?.total_bonus ?? 0;
            } else {
                const isCreatureOrNpc = actor.type === "creature" || actor.type === "npc";
                const creatureLevel = parseInt(actor.system?.attributes?.level?.value, 10) || 0;
                if (isCreatureOrNpc) {
                    const spellList = actor.items.find(i => i.type === "spell_list" && i.name === spellListName);
                    const stored = spellList?.flags?.rmss?.spellManeuverModifier;
                    skillBonus = (stored !== undefined && stored !== null)
                        ? parseInt(stored, 10) : creatureLevel;
                } else {
                    skillBonus = 0;
                }
            }
        }
        const castingModifier = castingOptions.castingModifier ?? castingOptions.totalModifier;
        const { hitsTaken = 0, bleeding = 0, stunned = 0, penaltyEffect = 0 } = castingOptions;
        const totalCastingModifier = castingOptions.totalModifier;

        const penaltyValue = Math.min(0, penaltyEffect);
        const restModifier = totalCastingModifier - hitsTaken - bleeding - penaltyValue;
        const virtualWeapon = { type: "spell", system: { attack_table: spell.system?.attack_table } };

        if (isBallSpell) {
            return BaseElementalSpellService._castBaseElementalBallSpell({
                actor,
                spell,
                spellListName,
                spellLevel,
                skillBonus,
                castingModifier,
                totalCastingModifier,
                virtualWeapon,
                attackTableName,
                enchantmentAttackBonus,
                noPP,
                hitsTaken,
                bleeding,
                stunned,
                penaltyEffect,
                penaltyValue,
                restModifier
            });
        }

        const targets = Array.from(game.user.targets);
        if (targets.length === 0) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.be_no_targets"));
            return false;
        }

        return BaseElementalSpellService._castBeNonBallSpell({
            actor,
            spell,
            spellListName,
            spellLevel,
            skillBonus,
            castingModifier,
            totalCastingModifier,
            virtualWeapon,
            attackTableName,
            enchantmentAttackBonus,
            noPP,
            targets,
            hitsTaken,
            bleeding,
            stunned,
            penaltyEffect,
            penaltyValue,
            restModifier
        });
    }

    /**
     * BE non-bola: confirmación con cada defensor, una tirada compartida, resolución por blanco.
     */
    static async _castBeNonBallSpell({
        actor,
        spell,
        spellListName,
        spellLevel,
        skillBonus,
        castingModifier,
        totalCastingModifier,
        virtualWeapon,
        attackTableName,
        enchantmentAttackBonus,
        noPP,
        targets,
        hitsTaken,
        bleeding,
        stunned,
        penaltyEffect,
        penaltyValue,
        restModifier
    }) {
        const casterToken = canvas.tokens.controlled.find((t) => t.actor?.id === actor.id) ?? actor.getActiveTokens?.()?.[0];
        const validTargets = targets.filter((t) => t.actor?.system?.armor_info);
        if (validTargets.length === 0) {
            ui.notifications.warn("Target must have armor info for attack confirmation.");
            return false;
        }

        // --- Multi-target: confirm for each, then one shared d100, then per-target baseEnergy from each diff
        if (validTargets.length > 1) {
            const perIndexDiff = new Map();
            for (let i = 0; i < validTargets.length; i++) {
                const target = validTargets[i];
                const enemyAct = target.actor;
                if (Utils.isTargetDefeated(enemyAct)) {
                    continue;
                }
                const facingValue = casterToken && target
                    ? FacingService.calculateFacing(casterToken, target)
                    : null;
                if (casterToken && target) {
                    const rotation = FacingService.getRotationToFaceTarget(casterToken, target);
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
                if (!game.user.isGM) {
                    ui.notifications.info(game.i18n.localize("rmss.combat.awaiting_gm_confirmation"));
                }
                const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemyAct, virtualWeapon, spellOptions);
                if (gmResponse?.confirmed) {
                    perIndexDiff.set(i, gmResponse.diff ?? 0);
                }
            }
            if (perIndexDiff.size === 0) {
                return false;
            }

            const activeSorted = [...perIndexDiff.keys()].sort((a, b) => a - b);
            const firstIndexGlobal = activeSorted[0];

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

            const attackTable = await RMSSTableManager.loadAttackTable(attackTableName);
            if (!attackTable) {
                ui.notifications.error(`Attack table not found: ${attackTableName}`);
                return true;
            }
            const maximum = await RMSSTableManager.getAttackTableMaxResult(virtualWeapon);
            const clamps = RMSSTableManager.getSpellModifiedClamps(attackTable, maximum);
            const CENTRAL_TARGET_PENALTY = 0;
            const AREA_TARGET_PENALTY = 20;

            let anySuccess = false;
            for (const i of activeSorted) {
                const target = validTargets[i];
                const enemyActor = target.actor;
                if (!enemyActor?.system?.armor_info) continue;

                const diff = perIndexDiff.get(i) ?? 0;
                const finalResult = naturalRoll + diff;
                const umResult = RMSSTableManager.findUnmodifiedAttack(attackTableName, naturalRoll, attackTable);
                const isUm = umResult != null;
                const baseEnergy = isUm
                    ? umResult.attack
                    : Math.min(Math.max(finalResult, clamps.min), clamps.max);

                const fCheckRow = RMSSTableManager.findAttackTableRow(attackTableName, attackTable, baseEnergy);
                const fCheckDamage = fCheckRow?.["1"];
                if (fCheckDamage === "F") {
                    if (i === firstIndexGlobal) {
                        const failureResult = await SpellFailureService.rollFailure(
                            "BE",
                            "spectacular_failure",
                            totalCastingModifier
                        );
                        await BaseElementalSpellService._createChatMessage({
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
                        return true;
                    }
                    continue;
                }

                const targetDefense = parseInt(enemyActor.system.armor_info?.total_db ?? 0) || 0;
                const areaPenalty = i === 0 ? CENTRAL_TARGET_PENALTY : AREA_TARGET_PENALTY;
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
                    enemyActor,
                    actor
                );

                const isNullResult =
                    attackResult.damage === "-" ||
                    attackResult.damage === 0 ||
                    attackResult.damage === "0" ||
                    attackResult.damage == null;
                if (isNullResult) {
                    continue;
                }

                let criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(
                    attackResult.damage,
                    attackTable.critical_severity || null
                );
                criticalResult = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(
                    criticalResult,
                    enemyActor
                );
                if (criticalResult.criticals === "fumble") {
                    continue;
                }

                anySuccess = true;

                await BaseElementalSpellService._postBeAttackBreakdown({
                    actor,
                    target,
                    spell,
                    naturalRoll,
                    rollTotal,
                    diff,
                    isUm,
                    baseEnergy,
                    finalResult,
                    targetDefense,
                    areaPenalty,
                    isAreaBall: false,
                    centerBonus: 0,
                    finalForTarget,
                    tableCellRaw: attackResult.damage
                });

                if (!RMSSWeaponCriticalManager.hasResolvableCriticalForChat(criticalResult)) {
                    const damageToApply = parseInt(criticalResult.damage, 10);
                    if (!isNaN(damageToApply) && damageToApply > 0) {
                        await RMSSWeaponCriticalManager.updateTokenOrActorHits(enemyActor, damageToApply, actor.id);
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
                } else {
                    await RMSSWeaponCriticalManager.getCriticalMessage(attackResult.damage, criticalResult, actor, target, false);
                }
            }

            if (anySuccess) {
                // Per-target chat already posted; no aggregate card for N>1 to avoid a single misleading baseEnergy
            }
        } else {
            // --- Single target: same order as before (confirm → roll → rest)
            const firstTarget = validTargets[0];
            const enemyActor = firstTarget.actor;
            const facingValue = casterToken && firstTarget
                ? FacingService.calculateFacing(casterToken, firstTarget)
                : null;
            if (casterToken && firstTarget) {
                const rotation = FacingService.getRotationToFaceTarget(casterToken, firstTarget);
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
                return false;
            }
            if (!game.user.isGM) {
                ui.notifications.info(game.i18n.localize("rmss.combat.awaiting_gm_confirmation"));
            }
            const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemyActor, virtualWeapon, spellOptions);
            if (!gmResponse?.confirmed) {
                return false;
            }
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
                return true;
            }
            const maximum = await RMSSTableManager.getAttackTableMaxResult(virtualWeapon);
            const umResult = RMSSTableManager.findUnmodifiedAttack(attackTableName, naturalRoll, attackTable);
            const isUm = umResult != null;
            const clamps = RMSSTableManager.getSpellModifiedClamps(attackTable, maximum);
            const baseEnergy = isUm
                ? umResult.attack
                : Math.min(Math.max(finalResult, clamps.min), clamps.max);
            const fCheckRow = RMSSTableManager.findAttackTableRow(attackTableName, attackTable, baseEnergy);
            const fCheckDamage = fCheckRow?.["1"];
            if (fCheckDamage === "F") {
                const failureResult = await SpellFailureService.rollFailure("BE", "spectacular_failure", totalCastingModifier);
                await BaseElementalSpellService._createChatMessage({
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
                return true;
            }
            await BaseElementalSpellService._createChatMessage({
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
            const targetDefense = parseInt(enemyActor.system.armor_info?.total_db ?? 0) || 0;
            const areaPenalty = 0;
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
                enemyActor,
                actor
            );
            const isNullResult =
                attackResult.damage === "-" ||
                attackResult.damage === 0 ||
                attackResult.damage === "0" ||
                attackResult.damage == null;
            if (!isNullResult) {
                let criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(
                    attackResult.damage,
                    attackTable.critical_severity || null
                );
                criticalResult = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(criticalResult, enemyActor);
                if (criticalResult.criticals !== "fumble") {
                    await BaseElementalSpellService._postBeAttackBreakdown({
                        actor,
                        target: firstTarget,
                        spell,
                        naturalRoll,
                        rollTotal,
                        diff: gmResponse.diff ?? 0,
                        isUm,
                        baseEnergy,
                        finalResult,
                        targetDefense,
                        areaPenalty: 0,
                        isAreaBall: false,
                        centerBonus: 0,
                        finalForTarget,
                        tableCellRaw: attackResult.damage
                    });
                    if (!RMSSWeaponCriticalManager.hasResolvableCriticalForChat(criticalResult)) {
                        const damageToApply = parseInt(criticalResult.damage, 10);
                        if (!isNaN(damageToApply) && damageToApply > 0) {
                            await RMSSWeaponCriticalManager.updateTokenOrActorHits(enemyActor, damageToApply, actor.id);
                            if (actor.type === "character") {
                                await ExperienceManager.applyExperience(actor, criticalResult.damage);
                            }
                        }
                        await RMSSWeaponCriticalManager.getHpOnlyDamageMessage(
                            attackResult.damage,
                            criticalResult,
                            actor,
                            firstTarget
                        );
                    } else {
                        await RMSSWeaponCriticalManager.getCriticalMessage(
                            attackResult.damage,
                            criticalResult,
                            actor,
                            firstTarget,
                            false
                        );
                    }
                }
            }
        }

        // Award spell XP and finish (non-ball, single and multi)
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

        // Item macros need the real caster token even when `spell` is a detached/temp Item
        // with no .actor (e.g. cast from a potion enchantment) — see Item._executeItemMacro.
        game.rmss = game.rmss || {};
        game.rmss.lastCasterToken = sourceToken ?? null;

        // Execute spell macro on success (via item.use: item, actor, token)
        await spell.use();
        return true;
    }

    /**
     * BE ball spell: requires a circle measured template; one EAR per token inside; +20 at geometric center; DB without shield.
     */
    static async _castBaseElementalBallSpell({
        actor,
        spell,
        spellListName,
        spellLevel,
        skillBonus,
        castingModifier,
        totalCastingModifier,
        virtualWeapon,
        attackTableName,
        enchantmentAttackBonus,
        noPP,
        hitsTaken,
        bleeding,
        stunned,
        penaltyEffect,
        penaltyValue,
        restModifier
    }) {
        const template = getLatestCircleTemplateForUser(game.user.id);
        if (!template) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.be_area_no_circle_template"));
            return false;
        }
        const epicenter = getCircleEpicenter(template);
        if (!epicenter) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.be_area_no_circle_template"));
            return false;
        }
        let areaTokens = getTokensInsideTemplate(template);
        areaTokens = areaTokens.filter((t) => t.actor && !Utils.isTargetDefeated(t.actor));
        areaTokens = sortTokensByEpicenter(areaTokens, epicenter.x, epicenter.y);
        if (areaTokens.length === 0) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.be_area_no_tokens_in_template"));
            return false;
        }

        const casterToken = canvas.tokens.controlled.find((t) => t.actor?.id === actor.id) ?? actor.getActiveTokens?.()?.[0];
        const perIndexDiff = new Map();
        for (let i = 0; i < areaTokens.length; i++) {
            const target = areaTokens[i];
            const enemyAct = target.actor;
            if (!enemyAct?.system?.armor_info) continue;
            if (Utils.isTargetDefeated(enemyAct)) {
                continue;
            }
            const facingValue = casterToken && target ? FacingService.calculateFacing(casterToken, target) : null;
            if (casterToken && target) {
                const rotation = FacingService.getRotationToFaceTarget(casterToken, target);
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
                areaElementalBall: true,
                ...(facingValue !== null && { facingValue })
            };
            if (!game.user.isGM) {
                ui.notifications.info(game.i18n.localize("rmss.combat.awaiting_gm_confirmation"));
            }
            const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemyAct, virtualWeapon, spellOptions);
            if (gmResponse?.confirmed) {
                perIndexDiff.set(i, gmResponse.diff ?? 0);
            }
        }
        if (perIndexDiff.size === 0) {
            return false;
        }

        const activeSorted = [...perIndexDiff.keys()].sort((a, b) => a - b);
        const firstIndexGlobal = activeSorted[0];

        // Area ball: closed 1d100 (no open-ended). Modified branch is capped outside `um` (e.g. 95 max);
        // a high open roll would not raise the table index, only add noise. One die for the whole template.
        const roll = await new Roll("1d100").evaluate();
        const naturalRoll = roll.dice[0].results[0].result;
        const rollTotal = naturalRoll;
        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
        }
        if (!noPP) {
            const currentPP = parseInt(actor.system.attributes?.power_points?.current ?? 0, 10);
            const newPP = Math.max(0, currentPP - spellLevel);
            await actor.update({ "system.attributes.power_points.current": newPP });
        }

        const attackTable = await RMSSTableManager.loadAttackTable(attackTableName);
        if (!attackTable) {
            ui.notifications.error(`Attack table not found: ${attackTableName}`);
            return true;
        }
        const maximum = await RMSSTableManager.getAttackTableMaxResult(virtualWeapon);

        for (const i of activeSorted) {
            const target = areaTokens[i];
            const enemyActorT = target.actor;
            if (!enemyActorT?.system?.armor_info) continue;

            const diff = perIndexDiff.get(i) ?? 0;
            const finalResult = naturalRoll + diff;
            const { attackColumnValue, isUm } = RMSSTableManager.resolveBallEarAttackValue(
                attackTableName,
                naturalRoll,
                finalResult,
                attackTable
            );

            if (RMSSTableManager.isBallGlobalFailureRow(attackTableName, attackTable, attackColumnValue)) {
                if (i === firstIndexGlobal) {
                    const failureResult = await SpellFailureService.rollFailure(
                        "BE",
                        "spectacular_failure",
                        totalCastingModifier
                    );
                    await BaseElementalSpellService._createChatMessage({
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
                        baseEnergy: attackColumnValue,
                        isUm,
                        failureResult,
                        isSpellFailure: true
                    });
                    return true;
                }
                continue;
            }

            const centerBonus = isTokenAtEpicenter(target, epicenter.x, epicenter.y) ? 20 : 0;
            const targetDefense = getAreaDefenseDb(enemyActorT);
            let finalForTarget = attackColumnValue - targetDefense + centerBonus;
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
                enemyActorT,
                actor
            );

            const isNullResult =
                attackResult.damage === "-" ||
                attackResult.damage === 0 ||
                attackResult.damage === "0" ||
                attackResult.damage == null;
            if (isNullResult) continue;

            let criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(
                attackResult.damage,
                attackTable.critical_severity || null
            );
            criticalResult = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(
                criticalResult,
                enemyActorT
            );

            if (criticalResult.criticals === "fumble") continue;

            await BaseElementalSpellService._postBeAttackBreakdown({
                actor,
                target,
                spell,
                naturalRoll,
                rollTotal,
                diff,
                isUm,
                baseEnergy: attackColumnValue,
                finalResult,
                targetDefense,
                areaPenalty: 0,
                isAreaBall: true,
                centerBonus,
                finalForTarget,
                tableCellRaw: attackResult.damage
            });

            if (!RMSSWeaponCriticalManager.hasResolvableCriticalForChat(criticalResult)) {
                const damageToApply = parseInt(criticalResult.damage, 10);
                if (!isNaN(damageToApply) && damageToApply > 0) {
                    await RMSSWeaponCriticalManager.updateTokenOrActorHits(enemyActorT, damageToApply, actor.id);
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

            await RMSSWeaponCriticalManager.getCriticalMessage(
                attackResult.damage,
                criticalResult,
                actor,
                target,
                false
            );
        }

        let spellXp = 0;
        if (actor.type === "character") {
            const casterLevel = actor.system.attributes?.level?.value ?? 1;
            const xp = ExperiencePointsCalculator.calculateSpellExpPoints(casterLevel, spellLevel);
            if (xp > 0) {
                spellXp = xp;
                const totalExpActor = parseInt(actor.system.attributes.experience_points.value, 10) + xp;
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
            triggerAutoAnimations(sourceToken, spell, areaTokens);
        }

        // Store area context for item macro (see Item._executeItemMacro JSDoc): captured now,
        // at the moment of actual resolution, so the macro doesn't have to re-query the canvas
        // for the circle template later — by then it may have been moved/deleted (e.g. the GM
        // clearing it right after seeing the chat result) and the macro would silently fall back
        // to an arbitrary point instead of the real impact location.
        game.rmss = game.rmss || {};
        game.rmss.lastSpellContext = {
            areaEpicenter: { x: epicenter.x, y: epicenter.y },
            areaDiameter: getCircleRadiusInGridUnits(template) * 2,
            targetTokenUuids: areaTokens.map((t) => t.document.uuid)
        };
        // Item macros need the real caster token even when `spell` is a detached/temp Item
        // with no .actor (e.g. cast from a potion enchantment) — see Item._executeItemMacro.
        game.rmss.lastCasterToken = sourceToken ?? null;

        await spell.use();
        return true;
    }

    /**
     * Public chat card: d100 + confirm mod. → EAR — DB — índice en tabla — celda (alineado a ataques con arma).
     */
    static async _postBeAttackBreakdown({
        actor,
        target,
        spell,
        naturalRoll,
        rollTotal,
        diff,
        isUm,
        baseEnergy,
        finalResult,
        targetDefense,
        areaPenalty = 0,
        isAreaBall = false,
        centerBonus = 0,
        finalForTarget,
        tableCellRaw
    }) {
        const tokenOrActor = target;
        const enemy = tokenOrActor?.actor ?? tokenOrActor;
        const diffNum = diff ?? 0;
        const diffFmt = diffNum >= 0 ? `+${diffNum}` : `${diffNum}`;
        const isExplosive = naturalRoll !== 100 && rollTotal !== naturalRoll;
        const hasAreaPenalty = !isAreaBall && areaPenalty > 0;
        const hasCenterLine = isAreaBall && centerBonus > 0;
        const ap = Math.max(0, areaPenalty);
        const tableCellDisplay = tableCellRaw == null || tableCellRaw === "" ? "—" : String(tableCellRaw);
        const esc = (x) => (foundry.utils?.escapeHTML ? foundry.utils.escapeHTML(String(x == null ? "" : x)) : String(x));
        const actorName = actor?.name || "";
        const publicBylineHtml = game.i18n.format("rmss.spells.be_attack_byline", {
            a: esc(actorName),
            b: esc(spell?.name || "")
        });
        let publicRollSummaryHtml;
        if (isExplosive) {
            publicRollSummaryHtml = `${esc(naturalRoll)} <span style="color:#ff9f4a;">→ ${esc(rollTotal)}</span> → <b>${esc(
                String(finalForTarget)
            )}</b> — <b>${esc(tableCellDisplay)}</b>`;
        } else {
            publicRollSummaryHtml = `${esc(naturalRoll)} → <b>${esc(
                String(finalForTarget)
            )}</b> — <b>${esc(tableCellDisplay)}</b>`;
        }
        const actorImg = actor?.img || "icons/svg/mystery-man.svg";
        const targetName = enemy?.name || tokenOrActor?.name || "";
        let targetImg = enemy?.img;
        if (!targetImg && tokenOrActor) {
            targetImg = tokenOrActor.document?.texture?.src || tokenOrActor.texture?.src || tokenOrActor.img;
        }
        if (!targetImg) targetImg = "icons/svg/mystery-man.svg";

        const html = await renderTemplate("systems/rmss/templates/chat/be-attack-breakdown.hbs", {
            actorName,
            publicBylineHtml,
            publicRollSummaryHtml,
            actorImg,
            targetImg,
            targetName,
            spellName: spell?.name || "",
            naturalRoll,
            rollTotal,
            isExplosive,
            diff: diffNum,
            diffFmt,
            finalResult,
            isUm,
            baseEnergy,
            targetDefense,
            areaPenalty: ap,
            hasAreaPenalty,
            isAreaBall,
            centerBonus,
            hasCenterBonus: hasCenterLine,
            finalForTarget,
            tableCellDisplay
        });
        await ChatMessage.create(
            withPublicRollMode({
                content: html,
                speaker: "Game Master"
            })
        );
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
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000; display: flex; align-items: center; gap: 6px;">
                            <img src="${spell.img || 'icons/svg/dice-target.svg'}" alt="" width="24" height="24" style="border-radius: 4px; flex-shrink: 0;">
                            ${spell.name} (BE)
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${spellListName} — ${game.i18n.localize("rmss.spells.cast_result")}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff;">
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

        await ChatMessage.create(withPublicRollMode({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            ...chatMessageOtherStyle()
        }));
    }
}
