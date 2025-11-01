
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
 *  - **PE (Penalty)** → Applies an activity penalty (e.g., –25 due to injuries).
 *  - **P (Parry Bonus)** → Adds or extends a parry effect for improved defense.
 *  - **NP (No Parry)** → Temporarily disables parry actions.
 *  - **BONUS** → Grants a temporary bonus effect (e.g., magical or situational).
 *  - **HP** → Applies direct hit point damage to the target.
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
 * - Duration rounds are relative to the current combat round (`game.combat.round`).
 *
 * @author Ruben Rey
 * @since 2025-11
 */
export class RMSSEffectApplier {
    static async applyCriticalEffects(critical, actor, originId) {
        if (!critical?.metadata) return;
        const entity = actor;
        const stun_bleeding = entity.system.attributes.critical_codes?.stun_bleeding ?? "-";

        if (critical.metadata.HP)
            await this._applyHPDamage(entity, critical.metadata.HP);

        for (const [key, value] of Object.entries(critical.metadata)) {
            switch (key) {
                case "STUN": await this._applyStun(entity, value, stun_bleeding); break;
                case "HPR": await this._applyBleeding(entity, value, stun_bleeding, critical.text); break;
                case "PE": await this._applyPenalty(entity, value, critical.text); break;
                case "P": await this._applyParry(entity, value); break;
                case "NP": await this._applyNoParry(entity, value); break;
                case "BONUS": await this._applyBonus(entity, value, critical.text, originId); break;
            }
        }
    }

    static async _applyHPDamage(entity, hp) {
        const dmg = parseInt(hp) || 0;
        const newHits = entity.system.attributes.hits.current - dmg;
        await entity.update({ "system.attributes.hits.current": newHits });
    }

    static async _applyStun(entity, data, stun_bleeding) {
        if (stun_bleeding !== "-") return;
        const rounds = parseInt(data.ROUNDS) || 0;
        const existing = entity.effects.find(e => e.name === "Stunned");
        if (existing) {
            const total = (existing.duration.rounds || 0) + rounds;
            await existing.update({ "duration.rounds": total });
        } else {
            await entity.createEmbeddedDocuments("ActiveEffect", [{
                name: "Stunned",
                icon: `${CONFIG.rmss.paths.icons_folder}stunned.svg`,
                origin: entity.id,
                disabled: false,
                duration: {
                    rounds,
                    startRound: game.combat ? game.combat.round : 0
                }
            }]);
        }
    }

    static async _applyBleeding(entity, data, stun_bleeding, description) {
        if (stun_bleeding === "bleeding") return;
        const rate = parseInt(data) || 0;
        await entity.createEmbeddedDocuments("ActiveEffect", [{
            name: "Bleeding",
            icon: `${CONFIG.rmss.paths.icons_folder}bleeding.svg`,
            origin: entity.id,
            description,
            disabled: false,
            flags: { rmss: { value: rate } },
            duration: { rounds: 1, startRound: game.combat ? game.combat.round : 0 }
        }]);
    }

    static async _applyPenalty(entity, data, description) {
        const val = parseInt(data.VALUE) || 0;
        const penalty = val > 0 ? -val : val;
        await entity.createEmbeddedDocuments("ActiveEffect", [{
            name: "Penalty",
            icon: `${CONFIG.rmss.paths.icons_folder}broken-bone.svg`,
            origin: entity.id,
            description,
            disabled: false,
            flags: { rmss: { value: penalty } },
            duration: { rounds: 1, startRound: game.combat ? game.combat.round : 0 }
        }]);
    }

    static async _applyParry(entity, data) {
        const rounds = parseInt(data.ROUNDS) || 0;
        const existing = entity.effects.find(e => e.name === "Parry");
        if (existing) {
            const total = (existing.duration.rounds || 0) + rounds;
            await existing.update({ "duration.rounds": total });
        } else {
            await entity.createEmbeddedDocuments("ActiveEffect", [{
                name: "Parry",
                icon: `${CONFIG.rmss.paths.icons_folder}sword-clash.svg`,
                origin: entity.id,
                disabled: false,
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
            await entity.createEmbeddedDocuments("ActiveEffect", [{
                name: "No parry",
                icon: `${CONFIG.rmss.paths.icons_folder}shield-disabled.svg`,
                origin: entity.id,
                disabled: false,
                duration: { rounds: r, startRound: game.combat ? game.combat.round : 0 }
            }]);
        }
    }

    static async _applyBonus(entity, data, description, originId) {
        const rounds = parseInt(data.ROUNDS) || 1;
        const value = parseInt(data.VALUE) || 0;
        const attacker = game.actors.get(originId);
        if (!attacker) return;

        await attacker.createEmbeddedDocuments("ActiveEffect", [{
            name: "Bonus",
            icon: `${CONFIG.rmss.paths.icons_folder}bonus.svg`,
            origin: originId,
            description,
            disabled: false,
            flags: { rmss: { value } },
            duration: { rounds, startRound: game.combat ? game.combat.round : 0 }
        }]);
    }

}
