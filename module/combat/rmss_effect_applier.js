import ExperiencePointsCalculator from "../sheets/experience/rmss_experience_manager.js";
import Utils from "../utils.js";
import { CombatHistoryTracker } from "./combat_history_tracker.js";
import WeaponEffectsService from "./weapon_effects_service.js";
import { shouldDeferTickToNextRound } from "./combat_tick_policy.js";
import { withPublicRollMode } from "../chat/chatMessages.js";

/**
 * @class RMSSEffectApplier
 * @classdesc
 * Handles the application of critical effects (stun, bleeding, penalties, bonuses, etc.)
 * resulting from combat or spell criticals in Rolemaster.
 *
 * This class centralizes logic that updates actor attributes (like current hits)
 * and manages ActiveEffect documents according to the critical's metadata.
 *
 * Each supported critical effect type has its own dedicated handler method:
 *  - **STUN** → Applies or extends a temporary "Stunned" ActiveEffect.
 *  - **HPR (Bleeding)** → Creates a persistent bleeding effect (damage-over-time).
 *  - **PE (Penalty)** → `VALUE` only = permanente; `ROUNDS` + `VALUE` = penalización temporal (baja por fin de turno hasta 0 y el efecto desaparece).
 *  - **P (Parry Bonus)** → Adds or extends a parry effect for improved defense.
 *  - **NP (No Parry)** → Temporarily disables parry actions.
 *  - **BONUS** → Grants a temporary bonus effect (e.g., magical or situational).
 *  - **HP** → Applies direct hit point damage to the target.
 *  - **DEAD** → `{ROUNDS: 0}` kills outright; `{ROUNDS: N}` creates a "Dying" effect that kills the actor when it expires (see combat_turn_tick.js).
 *
 * The class is designed for modularity and can be easily extended to include
 * new critical types or special-case logic (e.g., Fear, Poison, or Spell effects).
 *
 * Typical usage:
 * ```js
 * import { RMSSEffectApplier } from "./rmss_effect_applier.js";
 *
 * await RMSSEffectApplier.applyCriticalEffects(criticalResult, defenderActor, attackerId);
 * ```
 *
 * @remarks
 * - The `critical` parameter is expected to contain a `metadata` object with key/value pairs
 *   describing each sub-effect (e.g., `{ STUN: { ROUNDS: 3 }, PE: { VALUE: -25 } }`).
 * - All ActiveEffect icons are resolved from `CONFIG.rmss.paths.icons_folder`.
 * - Effects are automatically stacked or extended if an equivalent effect already exists.
 * - Duration rounds tick down when that actor **finishes** their initiative turn (see `combat_turn_tick.js`),
 *   with `tickDeferredUntilRound` if the effect was gained after they had already acted this round.
 *
 * @author Ruben Rey
 * @since 2025-11
 */
export class RMSSEffectApplier {
    static async applyCriticalEffects(critical, actor, originId) {
        if (!critical?.metadata) return;
        const entity = actor;
        const stun_bleeding = entity.system.attributes.critical_codes?.stun_bleeding ?? "-";

        // When GM applies critical from effects HUD, originId may be null; use last attacker if available
        let effectiveOriginId = originId;
        if (!effectiveOriginId && game.combat?.id) {
            effectiveOriginId = CombatHistoryTracker.get().getLastAttacker(entity.id);
        }

        if (critical.metadata.HP){
            const isDead = await this._applyHPDamage(entity, critical.metadata.HP, effectiveOriginId);

            // XP for kill is now included in the dead announcement message
        }

        for (const [key, value] of Object.entries(critical.metadata)) {
            switch (key) {
                case "STUN": await this._applyStun(entity, value, stun_bleeding); break;
                case "HPR": await this._applyBleeding(entity, value, stun_bleeding, critical.text, critical, effectiveOriginId); break;
                case "PE": await this._applyPenalty(entity, value, critical.text); break;
                case "P": await this._applyParry(entity, value); break;
                case "NP": await this._applyNoParry(entity, value); break;
                case "BONUS": await this._applyBonus(entity, value, critical.text, effectiveOriginId); break;
                case "DEAD": await this._applyDeath(entity, value, effectiveOriginId); break;
            }
        }
    }

    /**
     * If damage brings hits from above 0 to 0 or below, mark dead (effect, defeated, optional killer XP).
     * Used by crit HP metadata and by all weapon/spell damage paths that update hits directly.
     * @param {Actor} actor
     * @param {number} priorHits - hits.current before the update
     * @param {number} newHits - hits.current after the update
     * @param {string|null} attackerId
     * @param {Token|TokenDocument|null} [preferredToken] - e.g. targeted token from combat (more reliable than picking from scene)
     * @returns {Promise<boolean>} true if death handling ran
     */
    static async applyDeathIfBroughtToZero(actor, priorHits, newHits, attackerId, preferredToken = null) {
        const prior = Number(priorHits);
        const next = Number(newHits);
        if (!Number.isFinite(prior) || !Number.isFinite(next)) return false;
        if (next > 0 || prior <= 0) return false;

        await RMSSEffectApplier._executeDeath(actor, attackerId, preferredToken);
        return true;
    }

    /**
     * Kill an actor outright: awards killer XP (if applicable) and marks the token dead.
     * Shared end-state for HP-loss death and critical-triggered death (instant or delayed via "Dying").
     * @param {Actor} actor
     * @param {string|null} attackerId
     * @param {Token|TokenDocument|null} [preferredToken]
     */
    static async _executeDeath(actor, attackerId, preferredToken = null) {
        if (actor.effects.find(e => e.name === "Dead")) return;

        const fromPreferred = preferredToken?.actor?.id === actor?.id ? preferredToken : null;
        const tokens = actor.getActiveTokens(true);
        const selected = fromPreferred
            || tokens.find(t => t.controlled)
            || tokens[0];

        let expData = null;
        if (selected && attackerId && Utils.isAPC(attackerId)) {
            const killer = Utils.getActor(attackerId);
            if (killer) {
                const killExp = ExperiencePointsCalculator.calculateKillExpPoints(actor.system.attributes.level.value, killer.system.attributes.level.value);
                const code = actor.system?.bonus_experience ?? null;
                const bonusExp = ExperiencePointsCalculator.calculateBonusExpPoints(killer.system.attributes.level.value, code);
                const totalAmountExp = killExp + bonusExp;
                const totalExpActor = parseInt(killer.system.attributes.experience_points.value || 0) + totalAmountExp;
                await killer.update({ "system.attributes.experience_points.value": totalExpActor });
                expData = {
                    actorName: killer.name,
                    actorId: killer.id,
                    expBreakdown: { kill: killExp, bonus: bonusExp },
                    expGained: totalAmountExp
                };
            }
        }
        if (selected) await RMSSEffectApplier._markTokenAsDead(selected, expData);
    }

    /**
     * Handle the "DEAD" critical metadata: kills outright ({ROUNDS: 0}) or creates a
     * "Dying" ActiveEffect that kills the actor when its rounds run out (see combat_turn_tick.js).
     * @param {Actor} entity
     * @param {{ROUNDS?: number|string}} data
     * @param {string|null} originId
     */
    static async _applyDeath(entity, data, originId = null) {
        // Already dead (e.g. HP metadata on the same critical zeroed hits first) - nothing to do.
        if (entity.effects.find(e => e.name === "Dead")) return;

        const rounds = parseInt(data?.ROUNDS) || 0;

        if (rounds <= 0) {
            await RMSSEffectApplier._executeDeath(entity, originId);
            return;
        }

        const existing = entity.effects.find(e => e.name === "Dying");
        if (existing) {
            const total = Math.min(existing.duration.rounds || 0, rounds);
            await existing.update({ "duration.rounds": total });
            return;
        }

        const rmss = { attackerId: originId ?? null, ...RMSSEffectApplier._tickDeferralRmssFlags(game.combat, entity) };
        await entity.createEmbeddedDocuments("ActiveEffect", [{
            name: "Dying",
            icon: `${CONFIG.rmss.paths.icons_folder}dead-head.svg`,
            origin: entity.id,
            disabled: false,
            flags: { rmss },
            duration: { rounds, startRound: game.combat ? game.combat.round : 0 }
        }]);
    }

    static async _applyHPDamage(entity, hp, originId = null) {
        const dmg = parseInt(hp) || 0;
        const currentHits = entity.system.attributes.hits.current;
        const newHits = currentHits - dmg;
        await entity.update({ "system.attributes.hits.current": newHits });

        const wasAlreadyDead = currentHits <= 0;
        if (originId && game.combat?.id) {
            CombatHistoryTracker.get().recordDamage(originId, entity.id, dmg, newHits <= 0 && !wasAlreadyDead);
        }

        return RMSSEffectApplier.applyDeathIfBroughtToZero(entity, currentHits, newHits, originId);
    }

    /** @param {Combat|null} combat */
    static _tickDeferralRmssFlags(combat, actor) {
        const c = combat ?? game.combat;
        if (!c || !shouldDeferTickToNextRound(c, actor)) return {};
        return { tickDeferredUntilRound: c.round + 1 };
    }

    static async _applyStun(entity, data, stun_bleeding) {
        if (stun_bleeding !== "-") return;
        const rounds = parseInt(data.ROUNDS) || 0;
        const existing = entity.effects.find(e => e.name === "Stunned");
        if (existing) {
            const total = (existing.duration.rounds || 0) + rounds;
            await existing.update({ "duration.rounds": total });
        } else {
            const rmss = RMSSEffectApplier._tickDeferralRmssFlags(game.combat, entity);
            await entity.createEmbeddedDocuments("ActiveEffect", [{
                name: "Stunned",
                icon: `${CONFIG.rmss.paths.icons_folder}stunned.svg`,
                origin: entity.id,
                disabled: false,
                ...(Object.keys(rmss).length ? { flags: { rmss } } : {}),
                duration: {
                    rounds,
                    startRound: game.combat ? game.combat.round : 0
                }
            }]);
        }
    }

    static async _applyBleeding(entity, data, stun_bleeding, description, critical = null, originId = null) {
        if (stun_bleeding === "bleeding") return;
        let rate = parseInt(data) || 0;
        const ctx = critical?._rmssContext;
        const atkId = originId ?? ctx?.attackerId;
        if (atkId) {
            const attacker = game.actors.get(atkId);
            if (attacker && WeaponEffectsService.actorHasWeaponOfBleeding(attacker)) {
                const mainSev = ctx?.mainSeverity ?? ctx?.severity;
                rate += WeaponEffectsService.getWeaponOfBleedingHprBonus(mainSev);
            }
        }
        await entity.createEmbeddedDocuments("ActiveEffect", [{
            name: "Bleeding",
            icon: `${CONFIG.rmss.paths.icons_folder}bleeding.svg`,
            origin: entity.id,
            description,
            disabled: false,
            flags: { rmss: { value: rate, ...RMSSEffectApplier._tickDeferralRmssFlags(game.combat, entity) } },
            duration: { rounds: 99, startRound: game.combat ? game.combat.round : 0 }
        }]);
    }

    static async _applyPenalty(entity, data, description) {
        const val = parseInt(data.VALUE) || 0;
        const penalty = val > 0 ? -val : val;
        const roundsRaw = data.ROUNDS !== undefined && data.ROUNDS !== null ? parseInt(data.ROUNDS, 10) : NaN;
        const timedRounds = Number.isFinite(roundsRaw) && roundsRaw > 0 ? roundsRaw : 0;

        if (timedRounds > 0) {
            const rmss = {
                value: penalty,
                temporaryPenalty: true,
                ...RMSSEffectApplier._tickDeferralRmssFlags(game.combat, entity)
            };
            await entity.createEmbeddedDocuments("ActiveEffect", [{
                name: "Penalty",
                icon: `${CONFIG.rmss.paths.icons_folder}broken-bone.svg`,
                origin: entity.id,
                description,
                disabled: false,
                flags: { rmss },
                duration: { rounds: timedRounds, startRound: game.combat ? game.combat.round : 0 }
            }]);
            return;
        }

        await entity.createEmbeddedDocuments("ActiveEffect", [{
            name: "Penalty",
            icon: `${CONFIG.rmss.paths.icons_folder}broken-bone.svg`,
            origin: entity.id,
            description,
            disabled: false,
            flags: { rmss: { value: penalty, permanentPenalty: true } },
            duration: { rounds: 99, startRound: game.combat ? game.combat.round : 0 }
        }]);
    }

    static async _applyParry(entity, data) {
        const rounds = parseInt(data.ROUNDS) || 0;
        const existing = entity.effects.find(e => e.name === "Parry");
        if (existing) {
            const total = (existing.duration.rounds || 0) + rounds;
            await existing.update({ "duration.rounds": total });
        } else {
            const rmss = RMSSEffectApplier._tickDeferralRmssFlags(game.combat, entity);
            await entity.createEmbeddedDocuments("ActiveEffect", [{
                name: "Parry",
                icon: `${CONFIG.rmss.paths.icons_folder}sword-clash.svg`,
                origin: entity.id,
                disabled: false,
                ...(Object.keys(rmss).length ? { flags: { rmss } } : {}),
                duration: { rounds, startRound: game.combat ? game.combat.round : 0 }
            }]);
        }
    }

    static async _applyNoParry(entity, rounds) {
        const r = parseInt(rounds) || 0;
        const existing = entity.effects.find(e => e.name === "No parry");
        if (existing) {
            const total = (existing.duration.rounds || 0) + r;
            await existing.update({ "duration.rounds": total });
        } else {
            const rmss = RMSSEffectApplier._tickDeferralRmssFlags(game.combat, entity);
            await entity.createEmbeddedDocuments("ActiveEffect", [{
                name: "No parry",
                icon: `${CONFIG.rmss.paths.icons_folder}shield-disabled.svg`,
                origin: entity.id,
                disabled: false,
                ...(Object.keys(rmss).length ? { flags: { rmss } } : {}),
                duration: { rounds: r, startRound: game.combat ? game.combat.round : 0 }
            }]);
        }
    }

    static async _applyBonus(entity, data, description, originId) {
        const rounds = parseInt(data.ROUNDS) || 1;
        const value = parseInt(data.VALUE) || 0;
        const attacker = game.actors.get(originId);
        if (!attacker) return;

        const rmss = { value, ...RMSSEffectApplier._tickDeferralRmssFlags(game.combat, attacker) };
        await attacker.createEmbeddedDocuments("ActiveEffect", [{
            name: "Bonus",
            icon: `${CONFIG.rmss.paths.icons_folder}bonus.svg`,
            origin: originId,
            description,
            disabled: false,
            flags: { rmss },
            duration: { rounds, startRound: game.combat ? game.combat.round : 0 }
        }]);
    }

    /**
     * Marks a token as dead (like manual GM toggle).
     * Works both in and out of combat.
     * @param {Token} token - The target token object.
     */
    static async _markTokenAsDead(token, expData = null) {
        if (!token) return ui.notifications.error("No token provided.");

        const actor = token.actor;
        // 1) Create overlay effect ON THE TOKEN (not actor)
        await token.actor.createEmbeddedDocuments("ActiveEffect", [{
            name: "Dead",
            icon: globalThis.CONFIG.controlIcons.defeated,  // core skull
            origin: actor.uuid,
            disabled: false,
            flags: { core: { overlay: true } },
            // Use a large numeric duration so FVTT v13 renders it reliably
            duration: {
                rounds: 999999,
                startRound: game.combat ? game.combat.round : 0,
                seconds: 999999 * (CONFIG.time?.roundTime ?? 6),
                startTime: game.time.worldTime
            }
        }]);

        // 2) If this token is in the active combat, mark its combatant defeated (greys the portrait)
        const combatant = game.combat?.getCombatantByToken(token.id);
        if (combatant && !combatant.defeated) {
            await combatant.update({ defeated: true });
        }

        //chat dead announcement (with optional XP section when killer is APC)
        const templatePath = "systems/rmss/templates/chat/dead-announcement.hbs";
        const templateData = {
            name: actor.name,
            slain: game.i18n.localize("rmss.chat.slain"),
            restInPeace: game.i18n.localize("rmss.chat.restInPeace"),
            expData: expData ?? null
        };

        const content = await renderTemplate(templatePath, templateData);

        await ChatMessage.create(withPublicRollMode({
            speaker: "Game Master",
            content
        }));
    }
}
