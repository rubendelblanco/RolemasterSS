import { socket } from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import Utils from "../utils.js";
import ManeuverPenaltiesService from "../core/maneuver_penalties_service.js";
import RollService from "./services/roll_service.js";
import WeaponFumbleService from "./services/weapon_fumble_service.js";
import WeaponBreakageService from "./services/weapon_breakage_service.js";
import FacingService from "./services/facing_service.js";
import { RMSSWeaponCriticalManager } from "./rmss_weapon_critical_manager.js";
import WeaponEffectsService from "./weapon_effects_service.js";
import { pickMissileAmmoForAttack, consumeChosenAmmo } from "../actors/utils/ammunition_util.js";
import { withPublicRollMode } from "../chat/chatMessages.js";
import { getWeaponSlayingArray } from "../sheets/items/weapon_slaying_ui.js";
import { getCreatureTagsArray } from "../sheets/actors/creature_tags_ui.js";

export class RMSSWeaponSkillManager {

    static async handleAttack(actor, enemy, weapon, attackerToken = null, defenderToken = null) {
        const facingValue = (attackerToken && defenderToken)
            ? FacingService.calculateFacing(attackerToken, defenderToken)
            : null;
        // Sent through the socket so the GM-side handler can re-resolve the real actors by
        // token uuid instead of game.actors.get(id) -- for an unlinked token that returns the
        // base world actor and silently drops whatever that specific instance's ActorDelta
        // overrides (e.g. a bumped armor_type on just this creature).
        // Ammo is picked (not yet consumed) BEFORE the GM confirmation so its attack_bonus can be
        // folded into the confirm-attack dialog's total; it's only actually consumed once the
        // attack is confirmed (see below), so a cancelled attack doesn't burn a shot.
        const ammoPick = await pickMissileAmmoForAttack(actor, weapon);
        if (!ammoPick.ok) return;

        const tokenData = {
            facingValue,
            attackerTokenUuid: attackerToken?.document?.uuid ?? attackerToken?.uuid ?? null,
            enemyTokenUuid: defenderToken?.document?.uuid ?? defenderToken?.uuid ?? null,
            ammoBonus: Number(ammoPick.ammoItem?.system?.attack_bonus) || 0,
            ammoName: ammoPick.ammoItem?.name ?? null
        };

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

        const defenderActor = enemy instanceof Actor ? enemy : enemy?.actor ?? Utils.getActor(enemy);
        if (Utils.isTargetDefeated(defenderActor)) {
            ui.notifications.warn(game.i18n.localize("rmss.combat.target_already_defeated"));
            return;
        }

        if (!game.user.isGM) {
            ui.notifications.info(game.i18n.localize("rmss.combat.awaiting_gm_confirmation"));
        }
        const gmResponse = await socket.executeAsGM("confirmWeaponAttack", actor, enemy, weapon, tokenData);
        if (!gmResponse.confirmed) return;

        await consumeChosenAmmo(ammoPick.ammoItem);

        const rollData = await RollService.highOpenEndedD100();
        const baseAttack = rollData.roll.terms[0].results[0].result;

        // Breakage check: a natural double within the weapon's breakage_range triggers a silent
        // 1d100+strength roll, independent of whether this attack hits/fumbles.
        await WeaponBreakageService.maybeCheckBreakage(weapon, baseAttack, actor);

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

        if (game.dice3d) await game.dice3d.showForRoll(rollData.roll, game.user, true);
        await ChatMessage.create(withPublicRollMode({
            content: flavor,
            speaker: "Game master"
        }));

        const tableName = weapon.system.attack_table;
        const attackTable = await RMSSTableManager.loadAttackTable(tableName);
        if (!attackTable?.rows) {
            ui.notifications.error(game.i18n.format("rmss.combat.attack_table_load_failed", { table: tableName }));
            return;
        }
        const umResult = RMSSTableManager.findUnmodifiedAttack(tableName, baseAttack, attackTable);
        const maximum = await RMSSTableManager.getAttackTableMaxResult(weapon);

        if (umResult) {
            total = umResult.attack;
        }
        else {
            total = (total > maximum) ? maximum : total;
        }

        const armorTypeOverride = gmResponse.targetAt ?? null;
        const attackResult = await RMSSTableManager.getAttackTableResult(weapon, attackTable, total, enemy, actor, armorTypeOverride);
        if (attackResult.damage == null) {
            ui.notifications.warn(game.i18n.localize("rmss.combat.no_attack_result"));
            return;
        }
        let criticalResult = RMSSWeaponCriticalManager.decomposeCriticalResult(attackResult.damage, attackTable.critical_severity || null, weapon.system.critical_type);
        // Fumble from attack table (result "F")
        if (criticalResult.criticals === "fumble") {
            const fumbleRoll = new Roll("1d100");
            await fumbleRoll.evaluate();
            if (game.dice3d) await game.dice3d.showForRoll(fumbleRoll, game.user, true);
            await RMSSWeaponCriticalManager.getWeaponFumbleMessage(actor, weapon, fumbleRoll.total, fumbleRoll);
            return;
        }

        criticalResult = RMSSWeaponCriticalManager.filterCriticalResultForLargeCreatures(criticalResult, enemy);

        if (weapon.type === "weapon" || weapon.type === "creature_attack") {
            WeaponEffectsService.applyIncreasedCritical(criticalResult, weapon);
            WeaponEffectsService.appendEffectWeaponCriticals(criticalResult, weapon);
        }

        const isNullResult = attackResult.damage === "-" || attackResult.damage === 0 || attackResult.damage === "0" || attackResult.damage == null;

        // HP-only hit (no letter critical): apply damage immediately, then post the same chat card layout without roll buttons.
        if (!RMSSWeaponCriticalManager.hasResolvableCriticalForChat(criticalResult)) {
            if (!isNullResult) {
                const damageToApply = parseInt(criticalResult.damage);
                if (!isNaN(damageToApply) && damageToApply > 0) {
                    await RMSSWeaponCriticalManager.updateTokenOrActorHits(enemy, damageToApply, actor.id);
                    if (actor.type === "character") {
                        const { ExperienceManager } = await import("../sheets/experience/rmss_experience_manager.js");
                        await ExperienceManager.applyExperience(actor, criticalResult.damage);
                    }
                }
            }
            if (!isNullResult) {
                await RMSSWeaponCriticalManager.getHpOnlyDamageMessage(
                    attackResult.damage,
                    criticalResult,
                    actor,
                    defenderToken ?? enemy
                );
            }
            return;
        }

        await RMSSWeaponCriticalManager.getCriticalMessage(attackResult.damage, criticalResult, actor, defenderToken ?? enemy, isNullResult, weapon);
    }

    /**
     * Show confirm-attack modal. When spellOptions is provided (from BE spell), use pre-filled values instead of calculating.
     * @param {Actor} actor
     * @param {Actor} enemy
     * @param {Item} weapon
     * @param {Object} [spellOptions] - Pre-filled values from casting options: { ob, hitsTaken, bleeding, stunnedPenalty, penaltyValue, bonusValue }.
     *   bonusValue already includes ActiveEffect "Bonus" via cast total. Movement activity is applied here like weapon attacks.
     */
    static async attackMessagePopup(actor, enemy, weapon, spellOptionsOrTokenData = null) {
        let ob, hitsTaken, bleeding, penaltyValue, bonusValue, stunnedValue;
        const spellOptions = spellOptionsOrTokenData?.ob !== undefined ? spellOptionsOrTokenData : null;
        const tokenData = spellOptionsOrTokenData?.facingValue !== undefined ? spellOptionsOrTokenData : null;

        // Re-resolve real actors after crossing socketlib (which serializes Documents to
        // plain data, losing class methods AND any unlinked-token ActorDelta). Prefer the
        // token's own uuid when we have one -- it correctly threads through the delta;
        // game.actors.get(id) would return the base world actor and silently drop whatever
        // that specific token instance overrides (e.g. a bumped armor_type on just this orc).
        const realActor = await RMSSWeaponSkillManager._resolveRealActor(actor, tokenData?.attackerTokenUuid);
        if (!realActor) {
            console.error("[RMSS] Could not get the real actor", actor);
            return null;
        }
        const realEnemy = await RMSSWeaponSkillManager._resolveRealActor(enemy, tokenData?.enemyTokenUuid);

        // Same idea for the weapon: unlike actor/enemy this was never re-fetched at all, so a
        // player-initiated attack (which actually crosses the socket, unlike a GM-initiated one)
        // was using a de-hydrated weapon snapshot -- wrong/missing offensive_skill lookup and
        // slaying bonus.
        const realWeapon = (weapon?.id && realActor?.items?.get) ? (realActor.items.get(weapon.id) ?? weapon) : weapon;

        if (Utils.isTargetDefeated(realEnemy)) {
            ui.notifications.warn(game.i18n.localize("rmss.combat.target_already_defeated"));
            return { confirmed: false };
        }

        const facingValue = (tokenData?.facingValue ?? FacingService.FACING.FRONT) || "";

        // Movement budget for this round: weight-penalized effective_value when present
        // (characters), falling back to the raw value (npc/creature, unaffected by encumbrance).
        const move = realActor.system.attributes.movement_rate;
        const moveMax = move.effective_value ?? move.value;

        if (spellOptions) {
            ob = spellOptions.ob ?? 0;
            hitsTaken = spellOptions.hitsTaken ?? 0;
            bleeding = spellOptions.bleeding ?? 0;
            penaltyValue = spellOptions.penaltyValue ?? 0;
            bonusValue = spellOptions.bonusValue ?? 0;
            // Activity vs movement (matches non-spell path; "Bonus" effects are already in bonusValue from cast total)
            bonusValue -= Math.round(
                (1 - (move.current / moveMax)) * 100
            );
            const stunEffect = realEnemy ? Utils.getEffectByName(realEnemy, "Stunned") : [];
            stunnedValue = stunEffect.length > 0 && (stunEffect[0].duration?.rounds ?? 0) > 0;
        } else {
            const moveRatio = (move.current / moveMax);
            if (moveRatio < 0.5) {
                ui.notifications.warn("Unable to attack (activity behind 50%)", {localize: true});
                return null;
            }
            ob = RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(realWeapon, realActor);
            const maneuverPenalties = ManeuverPenaltiesService.getManeuverPenalties(realActor);
            const { hitsTaken: ht, bleeding: bl, penaltyEffect } = maneuverPenalties;
            hitsTaken = ht;
            bleeding = bl;
            penaltyValue = Math.min(0, penaltyEffect);
            const bonusEffects = Utils.getEffectByName(realActor, "Bonus");
            const stunEffect = Utils.getEffectByName(realEnemy, "Stunned");
            bonusValue = 0;
            bonusEffects.forEach((bonus) => { bonusValue += bonus.flags.rmss.value; });
            bonusValue += RMSSWeaponSkillManager._getSlayingBonusDelta(realWeapon, realEnemy, enemy);
            bonusValue += Number(tokenData?.ammoBonus) || 0;
            bonusValue -= Math.round((1 - (move.current / moveMax)) * 100);
            stunnedValue = stunEffect.length > 0 && (stunEffect[0].duration?.rounds ?? 0) > 0;
        }

        const enemyForTemplate = realEnemy ?? enemy;
        const armorInfo = enemyForTemplate?.system?.armor_info ?? {};
        const targetArmorType = armorInfo.armor_type ?? armorInfo.armor_info?.armor_type ?? 1;

        const areaElementalBall = spellOptions?.areaElementalBall === true;
        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-attack.hbs", {
            actor: realActor,
            enemy: enemyForTemplate,
            weapon: realWeapon,
            ob: ob,
            hitsTaken,
            bleeding,
            bonusValue,
            stunnedValue,
            penaltyValue,
            facingValue,
            targetArmorType: Math.max(1, Math.min(20, targetArmorType)),
            areaElementalBall,
            ammoName: tokenData?.ammoName ?? null
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
                            const armorInfo = realEnemy?.system?.armor_info ?? {};
                            const defaultAt = armorInfo.armor_type ?? armorInfo.armor_info?.armor_type ?? 1;
                            const at = parseInt(html.find("#target-at").val());
                            const targetAt = (isNaN(at) || at < 1 || at > 20) ? Math.max(1, Math.min(20, defaultAt)) : Math.max(1, Math.min(20, at));
                            resolve({confirmed: true, attackTotal, defenseTotal, diff, targetAt});
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

    /**
     * Re-resolve a live Actor document after it's crossed socketlib, which serializes
     * Documents to plain data -- losing class methods and, critically, any unlinked
     * token's ActorDelta overrides. game.actors.get(id) alone would return the base world
     * actor for those, silently discarding whatever that specific token instance changed
     * (e.g. one particular orc with a bumped armor_type). Prefer resolving via the
     * originating token's own uuid when we have one; fall back to game.actors.get(id)
     * otherwise (also covers non-Actor callers that never had a token to begin with).
     * @param {Actor|object} candidate - the (possibly de-hydrated) actor received over the socket
     * @param {string|null} [tokenUuid] - the originating token's document uuid, if known
     * @returns {Promise<Actor|object|null>}
     */
    static async _resolveRealActor(candidate, tokenUuid = null) {
        if (tokenUuid) {
            const tokenDoc = await fromUuid(tokenUuid);
            if (tokenDoc?.actor) return tokenDoc.actor;
        }
        if (candidate?.id && game.actors) return game.actors.get(candidate.id) ?? candidate;
        return candidate ?? null;
    }

    /**
     * @param {Item} weapon
     * @param {Actor} actor - the attacker
     * @returns {number}
     */
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

    /**
     * "+10, +25 vs Orcs" weapons: reuses the SAME Slaying tags (system.slaying) instead of a
     * second tag list — a weapon that's both a Slayer of and has a special bonus against a
     * creature type is targeting the same tags either way, no point typing them twice. On a
     * match, the weapon's own magic-bonus portion of the OB is REPLACED (not added to) by
     * slaying_bonus — this returns the delta to add on top of the normal OB (0 when no match),
     * meant to be added into the confirm-attack "misc" field rather than mixed into the OB.
     * Independent of system.isSlaying: applies purely on a tag match.
     * @param {Item} weapon
     * @param {...(Actor|null|undefined)} enemyCandidates - checked in order; tags from every
     *   candidate with a .system are combined, since a socket-resolved enemy actor can miss
     *   tags an unlinked token's own actor instance has (or vice versa).
     * @returns {number}
     */
    static _getSlayingBonusDelta(weapon, ...enemyCandidates) {
        const slayingTags = getWeaponSlayingArray(weapon.system).map((t) => t.toLowerCase());
        const slayingBonus = Number(weapon.system.slaying_bonus) || 0;
        if (slayingTags.length === 0 || slayingBonus === 0) {
            return 0;
        }

        const creatureTags = new Set();
        for (const enemy of enemyCandidates) {
            if (enemy?.system) {
                getCreatureTagsArray(enemy.system).forEach((t) => creatureTags.add(t.toLowerCase()));
            }
        }

        if (!slayingTags.some((t) => creatureTags.has(t))) {
            return 0;
        }

        const normalWeaponBonus = Number(weapon.system.bonus) || 0;
        return slayingBonus - normalWeaponBonus;
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