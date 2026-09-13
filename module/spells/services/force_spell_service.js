import BaseSpellService from "./base_spell_service.js";
import ResistanceRollService from "../../core/rolls/resistance_roll_service.js";
import { triggerAutoAnimations, getActorToken } from "../../autoanimations_integration.js";
import CastingOptionsService from "./casting_options_service.js";
import StaticManeuverService from "./static_maneuver_service.js";
import SpellFailureService from "./spell_failure_service.js";
import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage, whisperIdsForNpcRollPrivacy, dice3dSynchronizeForNpcRoll, chatMessageOtherStyle } from "../../chat/chatMessages.js";
import { CombatHistoryTracker } from "../../combat/combat_history_tracker.js";
import Utils from "../../utils.js";
import { getMatchingSpellAdder, consumeSpellAdderUse, validatePpForSpellCastAfterDialog } from "../../actors/utils/power_points_util.js";

/**
 * Service to handle spell casting for non-elemental spells (F, P, U, I, E types).
 * For F type with targets: casting options -> skill lookup -> roll -> Basic Spell Attack Table -> RR modifier -> RR calculation
 * For other types (E, P, U, I) or F without targets: casting options -> skill lookup -> roll -> Static Maneuver Table result
 */
export default class ForceSpellService {

    /**
     * Cast a spell (F, P, U, I types).
     * @param {Object} params
     * @param {Actor} params.actor - The caster actor
     * @param {Item} params.spell - The spell being cast
     * @param {string} params.spellListName - Name of the spell list (to find matching skill)
     * @param {string} params.spellListRealm - Realm of the spell list
     * @param {number} [params.casterLevelOverride] - Artifact fixed cast level (e.g. "30th level
     *   effect" items): when > 0, used instead of the actor's real level for the RR the target
     *   must beat (and its display), leaving XP awards tied to the actor's real level.
     * @returns {Promise<boolean>} true once the cast actually committed (PP spent / dice rolled)
     *   — including a spell failure or fumble, which still burns the attempt — false if it
     *   aborted before that point (insufficient PP, dialog cancelled). Callers that consume a
     *   one-shot resource (e.g. a potion, see castEnchantmentFromItem) should only do so when
     *   this returns true.
     */
    static async castForceSpell({ actor, spell, spellListName, spellListRealm, consumePowerPoints = true, fromEnchantment = false, enchantmentAttackBonus = 0, casterLevelOverride = 0 }) {
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

        // Determine realm for casting options
        const effectiveRealm = spellListRealm || actor.system.fixed_info?.realm || "essence";

        const castingOptions = await CastingOptionsService.showCastingOptionsDialog({
            realm: effectiveRealm,
            spellType: spell.system.type,
            spellName: spell.name,
            actor,
            spellAdderItemName: spellAdder?.item?.name ?? null,
            spellAdderUsesRemaining: spellAdder?.usesRemaining ?? 0,
            spellAdderUsesMax: spellAdder?.value ?? 0,
            spellLevel,
            spendPp: !noPP,
            fromEnchantment
        });

        if (castingOptions === null) {
            return false;
        }

        if (castingOptions.useSpellAdder) {
            noPP = true;
            if (spellAdder?.item) await consumeSpellAdderUse(spellAdder.item);
        }
        if (!validatePpForSpellCastAfterDialog(actor, spell, spellLevel, noPP)) {
            return false;
        }

        let totalCastingModifier = castingOptions.totalModifier;
        const castingModifier = castingOptions.castingModifier ?? castingOptions.totalModifier;
        const { hitsTaken = 0, bleeding = 0, stunned = 0, penaltyEffect = 0, publicRollToPlayers = true } = castingOptions;
        const syncDice3d = dice3dSynchronizeForNpcRoll(actor, publicRollToPlayers);

        // Movement penalty in combat: -1 per 1% of activity dedicated to movement (applies to non-BE, non-DE, non-instant spells)
        let movementPenalty = 0;
        const spellType = spell.system?.type ?? "";
        const needsManeuverRoll = !["BE", "DE", "I"].includes(spellType);
        if (game.combat?.started && needsManeuverRoll) {
            const movement = actor.system.attributes?.movement_rate;
            if (movement?.value > 0) {
                const moveRatio = movement.current / movement.value;
                movementPenalty = -Math.round((1 - moveRatio) * 100);
                totalCastingModifier += movementPenalty;
            }
        }

        // Find the skill with the same name as the spell list; if from enchantment, maneuver ability is always 0
        let skillBonus;
        if (fromEnchantment) {
            skillBonus = 0;
        } else {
            const skill = actor.items.find(i =>
                i.type === "skill" && i.name === spellListName
            );
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

        // Get targets
        const targets = Array.from(game.user.targets);
        const hasTargets = targets.length > 0;

        // Roll the dice - open-ended upward (explodes on 96+)
        const roll = await new Roll("1d100x>95").evaluate();
        
        // Natural roll is the FIRST die result (before explosions)
        const naturalRoll = roll.dice[0].results[0].result;
        
        // 100 is special (UM 100) - don't use explosive total, only the natural 100
        // 96-99 explode normally
        const rollTotal = naturalRoll === 100 ? 100 : roll.total;
        
        // Show dice animation if Dice So Nice is active
        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, syncDice3d);
        }

        // Deduct power points (spell level = PP cost), unless spell has no_pp
        if (!noPP) {
            const currentPP = parseInt(actor.system.attributes?.power_points?.current ?? 0);
            const newPP = Math.max(0, currentPP - spellLevel);
            await actor.update({ "system.attributes.power_points.current": newPP });
        }
        
        // Unmodified rolls: 01-02 and 96-100 (don't add skill bonus or casting modifiers)
        // For unmodified high rolls (96-99), use the explosive total
        // For 100, use just 100 (special result UM 100)
        // Modified rolls: 03-95 (add skill bonus and casting modifiers to first roll only)
        const isUnmodified = naturalRoll <= 2 || naturalRoll >= 96;
        const totalBonus = skillBonus + totalCastingModifier + enchantmentAttackBonus;
        const finalResult = isUnmodified ? rollTotal : naturalRoll + totalBonus;

        // Only process RR for Force (F) type spells with targets
        const isForceSpell = spell.system.type === "F";
        let isFumble = false;
        let targetRRs = [];
        let failureResult = null;
        // Raw (un-normalized) realm, exposed to item macros via spellContext.realm below so
        // they can look up each target's own resistance_rolls bonus (e.g. Sleep-type spells
        // that roll each target's personal RR against targetRRs[].finalRR themselves).
        let targetRRsRealm = null;
        // Artifact fixed cast level ("30th level effect") overrides the actor's real level only
        // for the RR the target must beat — XP awards below stay tied to the actor's real level.
        const effectiveCasterLevel = casterLevelOverride > 0
            ? casterLevelOverride
            : (actor.system.attributes?.level?.value ?? 1);

        if (isForceSpell && hasTargets) {
            // Determine realm: use spell list realm, or fall back to actor's realm for base lists
            const effectiveRealm = spellListRealm || actor.system.fixed_info?.realm || "essence";
            const realm = this._normalizeRealm(effectiveRealm);
            targetRRsRealm = effectiveRealm;
            const casterLevel = effectiveCasterLevel;
            
            // Process each target separately (different armor types)
            for (const target of targets) {
                const targetActor = target.actor;
                const targetLevel = targetActor?.system?.attributes?.level?.value ?? 1;
                
                // Get the RR modifier from the table for THIS target
                // Each target may have different armor/helmet type
                const spellResult = await BaseSpellService.getBaseSpellResult({
                    realm: realm,
                    naturalRoll: naturalRoll,
                    modifier: isUnmodified ? 0 : totalBonus,
                    targetName: target.name
                });

                // If user cancelled the dialog, skip this target
                if (spellResult === null) {
                    continue;
                }

                const { result, subindices } = spellResult;

                if (result === "F") {
                    // Base spell fumble: roll on Spell Failure Table (same as normal spell failure)
                    isFumble = true;
                    failureResult = await SpellFailureService.rollFailure(
                        spell.system.type,
                        "spectacular_failure", // Base spell fumble = worst case (×3 modifier)
                        totalCastingModifier,
                        syncDice3d
                    );
                    break; // Stop processing targets on fumble
                }
                
                const rrModifier = result;

                // Defender stunned: +20 to RR (target must roll 20 higher to resist)
                const stunEffect = targetActor ? Utils.getEffectByName(targetActor, "Stunned") : [];
                const defenderStunned = stunEffect.length > 0 && (stunEffect[0].duration?.rounds ?? 0) > 0;

                // Per-spell RR bonus (F spells only): positive helps the target resist, negative hurts them
                const spellRRBonus = parseInt(spell.system.rr_bonus, 10) || 0;

                const effectiveRRModifier = (defenderStunned ? rrModifier - 20 : rrModifier) + spellRRBonus;

                // Calculate final RR using the unified method
                const finalRR = ResistanceRollService.getFinalRR(
                    casterLevel,
                    targetLevel,
                    effectiveRRModifier
                );

                // Format subindices for display
                const subindexDisplay = Object.values(subindices).join(" / ");

                targetRRs.push({
                    name: target.name,
                    finalRR: finalRR,
                    targetLevel: targetLevel,
                    rrModifier: rrModifier,
                    defenderStunned,
                    subindex: subindexDisplay,
                    tokenId: target.id,
                    tokenUuid: target.uuid ?? target.document?.uuid ?? null
                });
            }
        }

        // For non-Force spells (or Force without targets), get Static Maneuver result - unless
        // cast from an item: there's no casting maneuver to roll for a wand/potion/artifact, it
        // just goes off (isFumble/failureResult stay at their unset defaults, so isSuccess below
        // is automatically true). Whatever the spell type still requires afterward - a Force
        // attack roll against a target, a target's resistance roll - already runs unaffected,
        // since that's a separate mechanic from this maneuver check.
        let maneuverResult = null;
        if (!fromEnchantment && (!isForceSpell || !hasTargets)) {
            maneuverResult = await StaticManeuverService.getResult(finalResult, naturalRoll);

            // If result is a failure, roll on Spell Failure Table
            if (maneuverResult && SpellFailureService.isFailureResult(maneuverResult.code)) {
                failureResult = await SpellFailureService.rollFailure(
                    spell.system.type,
                    maneuverResult.code,
                    totalCastingModifier,
                    syncDice3d
                );
            }
        }

        // Create chat message (use totalCastingModifier so movement penalty is reflected)
        await this._createChatMessage({
            actor,
            spell,
            spellListName,
            skillBonus,
            castingModifier: totalCastingModifier,
            enchantmentAttackBonus,
            hitsTaken,
            bleeding,
            stunned,
            penaltyEffect,
            movementPenalty,
            naturalRoll,
            rollTotal,
            finalResult,
            isUnmodified,
            targets,
            isFumble,
            targetRRs,
            maneuverResult,
            failureResult,
            casterLevel: effectiveCasterLevel,
            publicToPlayers: publicRollToPlayers
        });

        // Execute spell macro only on success (no failure, no fumble)
        const isSuccess = !failureResult && !isFumble;
        if (isSuccess) {
            // Award spell experience for characters (same criteria as skill maneuvers)
            // Static Maneuver spells: only Success, Unusual Success, Absolute Success
            // Force spells with targets (Basic Spell Attack): award when no fumble
            const spellSuccessCodes = ["success", "unusual_success", "absolute_success"];
            const shouldAwardSpellXp = actor.type === "character" && (
                !maneuverResult
                    ? true  // Force with targets: no maneuver table, award on success
                    : spellSuccessCodes.includes(maneuverResult.code)
            );
            let spellXp = 0;
            if (shouldAwardSpellXp) {
                const casterLevel = actor.system.attributes?.level?.value ?? 1;
                const spellLevel = spell.system?.level ?? 1;
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
                CombatHistoryTracker.get().recordSpellCast(actor.id, spell.system?.level ?? 1, spellXp);
            }

            // Store RR context for item macro (see Item._executeItemMacro JSDoc; e.g. Dormir V: roll RR per target, apply sleep if failed)
            game.rmss = game.rmss || {};
            game.rmss.lastSpellContext = targetRRs.length > 0
                ? { targetRRs, casterLevel: effectiveCasterLevel, realm: targetRRsRealm }
                : null;

            const sourceToken = getActorToken(actor);
            if (sourceToken) {
                triggerAutoAnimations(sourceToken, spell, Array.from(game.user.targets));
            }

            // Item macros need the real caster token even when `spell` is a detached/temp Item
            // with no .actor (e.g. cast from a potion enchantment) — see Item._executeItemMacro.
            game.rmss = game.rmss || {};
            game.rmss.lastCasterToken = sourceToken ?? null;

            await spell.use();
        }

        // PP was already spent above regardless of outcome (success, failure, or fumble all
        // burn the attempt) — this is the "the cast committed" signal, not "it succeeded".
        return true;
    }

    /**
     * Perform an open-ended roll (exploding on 96+ and 01-05).
     * @returns {Promise<{naturalRoll: number, total: number}>}
     */
    static async _rollOpenEnded() {
        let total = 0;
        let naturalRoll = 0;
        let isFirst = true;
        let keepRolling = true;
        let direction = 0; // 0 = undetermined, 1 = high, -1 = low

        while (keepRolling) {
            const roll = await new Roll("1d100").evaluate();
            const result = roll.total;

            if (isFirst) {
                naturalRoll = result;
                total = result;
                isFirst = false;

                // Determine direction
                if (result >= 96) {
                    direction = 1; // High open-ended
                } else if (result <= 5) {
                    direction = -1; // Low open-ended
                } else {
                    keepRolling = false;
                }
            } else {
                // Subsequent rolls
                if (direction === 1) {
                    total += result;
                    keepRolling = result >= 96;
                } else if (direction === -1) {
                    total -= result;
                    keepRolling = result <= 5;
                }
            }
        }

        return { naturalRoll, total };
    }

    /**
     * Normalize realm string for hybrid realms.
     * Converts "essence/channeling" to ["essence", "channeling"], etc.
     * Also handles "arcane" -> "essence" conversion.
     * @param {string} realm
     * @returns {string|string[]}
     */
    static _normalizeRealm(realm) {
        if (!realm) return "essence";
        
        const lowerRealm = realm.toLowerCase().trim();
        
        // Handle hybrid realms (e.g., "essence/channeling")
        if (lowerRealm.includes("/")) {
            return lowerRealm.split("/").map(r => {
                const trimmed = r.trim();
                return trimmed === "arcane" ? "essence" : trimmed;
            });
        }
        
        // Single realm - convert arcane to essence
        return lowerRealm === "arcane" ? "essence" : lowerRealm;
    }

    /**
     * Create the chat message with the spell cast results.
     */
    static async _createChatMessage({
        actor,
        spell,
        spellListName,
        skillBonus,
        castingModifier = 0,
        enchantmentAttackBonus = 0,
        hitsTaken = 0,
        bleeding = 0,
        stunned = 0,
        penaltyEffect = 0,
        movementPenalty = 0,
        naturalRoll,
        rollTotal = null,
        finalResult,
        isUnmodified = false,
        targets,
        isFumble,
        targetRRs = [],
        maneuverResult = null,
        failureResult = null,
        casterLevel = 1,
        publicToPlayers = true
    }) {
        const hasTargets = targets.length > 0;
        const totalBonus = skillBonus + castingModifier + enchantmentAttackBonus;
        const formatMod = (n) => n >= 0 ? `+${n}` : `${n}`;
        const isExplosive = rollTotal && rollTotal !== naturalRoll;
        
        let content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${actor.img}" alt="${actor.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000; display: flex; align-items: center; gap: 6px;">
                            <img src="${spell.img || 'icons/svg/dice-target.svg'}" alt="" width="24" height="24" style="border-radius: 4px; flex-shrink: 0;">
                            ${spell.name}
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${spellListName} — ${game.i18n.localize("rmss.spells.cast_result")}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff;">
                    <div>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${naturalRoll}</strong>${isExplosive ? ` → <strong style="color: orange;">${rollTotal}</strong> 💥` : ''}${isUnmodified ? ` <em style="color:#aaa;">(${game.i18n.localize("rmss.spells.unmodified")})</em>` : ''}</div>
                    ${!isUnmodified ? `
                    <div>📊 Skill: <strong>${formatMod(skillBonus)}</strong></div>
                    ${castingModifier !== 0 ? `<div>🎯 Casting: <strong>${formatMod(castingModifier)}</strong></div>` : ''}
                    ${enchantmentAttackBonus !== 0 ? `<div>✨ ${game.i18n.localize("rmss.item.enchantments_attack_bonus")}: <strong>${formatMod(enchantmentAttackBonus)}</strong></div>` : ''}
                    ${hitsTaken !== 0 ? `<div>💔 ${game.i18n.localize("rmss.combat.hits_taken")}: <strong>${formatMod(hitsTaken)}</strong></div>` : ''}
                    ${bleeding !== 0 ? `<div>🩸 ${game.i18n.localize("rmss.maneuvers.bleeding")}: <strong>${formatMod(bleeding)}</strong></div>` : ''}
                    ${stunned !== 0 ? `<div>😵 ${game.i18n.localize("rmss.maneuvers.stunned")}: <strong>${formatMod(stunned)}</strong></div>` : ''}
                    ${penaltyEffect !== 0 ? `<div>🩹 ${game.i18n.localize("rmss.combat.penalty")}: <strong>${formatMod(Math.min(0, penaltyEffect))}</strong></div>` : ''}
                    ${movementPenalty !== 0 ? `<div>🏃 ${game.i18n.localize("rmss.spells.movement_penalty")}: <strong>${formatMod(movementPenalty)}</strong></div>` : ''}
                    ` : ''}
                    <div>📈 Total: <strong>${finalResult}</strong></div>
                </div>
        `;

        // Show Static Maneuver result for non-Force spells
        if (maneuverResult) {
            const resultClass = StaticManeuverService.getResultClass(maneuverResult.code);
            content += `
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div class="spell-maneuver-result ${resultClass}">
                    <p class="maneuver-name"><strong>${maneuverResult.name}</strong></p>
                    <p class="maneuver-description">${maneuverResult.description}</p>
                </div>
            `;
        }

        // Show Spell Failure result if there was a failure
        if (failureResult) {
            const multiplierText = failureResult.multiplier > 1 ? ` (×${failureResult.multiplier})` : '';
            content += `
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div class="spell-failure-result">
                    <h4>⚠️ ${game.i18n.localize("rmss.spells.spell_failure_roll")}</h4>
                    <div class="failure-roll-details">
                        <p>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${failureResult.naturalRoll}</strong></p>
                        <p>📊 ${game.i18n.localize("rmss.spells.casting_penalty")}: <strong>${formatMod(failureResult.modifierPenalty)}</strong>${multiplierText}</p>
                        <p>📈 Total: <strong>${failureResult.finalResult}</strong></p>
                    </div>
                    <div class="failure-description">
                        <p>${failureResult.description}</p>
                    </div>
                </div>
            `;
        }

        if (hasTargets) {
            if (isFumble && !failureResult) {
                content += `
                    <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                    <div class="spell-fumble">
                        <p>💥 <strong>${game.i18n.localize("rmss.spells.spell_fumble")}</strong></p>
                    </div>
                `;
            } else if (targetRRs.length > 0) {
                content += `
                    <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                    <div class="spell-rr-results">
                        <p><strong>${game.i18n.localize("rmss.spells.targets_must_roll")}:</strong></p>
                        <table class="spell-rr-table">
                            <thead>
                                <tr>
                                    <th>Target</th>
                                    <th>Lvl</th>
                                    <th>Mod</th>
                                    <th>RR</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                for (const targetRR of targetRRs) {
                    const modDisplay = targetRR.rrModifier >= 0 ? `+${targetRR.rrModifier}` : targetRR.rrModifier;
                    const stunnedNote = targetRR.defenderStunned
                        ? ` <span class="spell-rr-stunned">(${game.i18n.localize("rmss.spells.defender_stunned_rr")})</span>`
                        : "";
                    content += `
                                <tr>
                                    <td>
                                        ${targetRR.name}
                                        <div class="spell-rr-subindex">${targetRR.subindex}</div>
                                    </td>
                                    <td>${targetRR.targetLevel}</td>
                                    <td>${modDisplay}</td>
                                    <td><strong>${targetRR.finalRR}</strong>${stunnedNote}</td>
                                </tr>
                    `;
                }
                
                content += `
                            </tbody>
                        </table>
                        <p class="spell-rr-note">(Caster Lvl: ${casterLevel})</p>
                    </div>
                `;
            }
        }

        content += `</div>`;

        const whisper = whisperIdsForNpcRollPrivacy(actor, publicToPlayers);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: content,
            ...chatMessageOtherStyle(),
            ...(whisper ? { whisper } : {})
        });
    }
}
