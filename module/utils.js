export default class Utils {
    /**
     * Checks if a given actor ID corresponds to a player character (PC) and returns the actor if true.
     *
     * @param {string} attackerId - The ID of the actor to check.
     * @returns {Actor|boolean} - Returns the actor object if it is of type "character", otherwise returns `false`.
     */
    static isAPC(attackerId) {
        const actor = game.actors.get(attackerId);

        if (actor && actor.type === "character") {
            return actor;
        } else {
            return false;
        }
    }

    static getEffectByName(actorOrToken, effectName) {
        const actor = actorOrToken ?? actorOrToken.actor;
        return actor.effects.filter(effect => effect.name === effectName);
    }

    /**
     * Get normalized sex for any actor type (character, npc, creature).
     * Used by spell macros for effects (e.g. chant sounds).
     * @param {Actor} actor - The actor
     * @returns {"male"|"female"|"other"} Normalized sex
     */
    static getActorSex(actor) {
        if (!actor) return "other";
        let sex = "";
        switch (actor.type) {
            case "character":
                sex = actor.system.role_traits?.sex ?? "";
                break;
            case "npc":
            case "creature":
                sex = actor.system.fixed_info?.sex ?? actor.system.role_traits?.sex ?? "";
                break;
            default:
                sex = actor.system.fixed_info?.sex ?? actor.system.role_traits?.sex ?? "";
        }
        const normalized = String(sex || "").toLowerCase().trim();
        if (normalized === "female") return "female";
        if (normalized === "male") return "male";
        return "other";
    }

    static getActor(actorOrTokenOrId) {
        if (actorOrTokenOrId instanceof Actor) {
            return actorOrTokenOrId;
        }

        if (actorOrTokenOrId instanceof Token) {
            return actorOrTokenOrId.actor;
        }

        // tokenId?
        let actor = canvas.tokens.get(actorOrTokenOrId)?.actor;
        if (actor){
            return actor;
        }

        // actorId?
        return game.actors.get(actorOrTokenOrId);
    }

    /**
     * Whether the actor should not receive attacks (no HP left or marked defeated in the active encounter).
     *
     * Matches the combatant by token, not by actorId: two unlinked tokens created from the same
     * base Actor (e.g. the same creature dragged onto the scene twice) still share actor.id even
     * though each has its own independent hits/defeated state - matching by actorId marked every
     * other instance of that creature as defeated the moment one of them died. actor.token is the
     * per-token synthetic-actor backreference (set for any unlinked token); only a genuinely
     * linked actor (no token backref, e.g. resolved by actor id outside combat) falls back to the
     * old actorId match, where "every token IS this same entity" is the correct semantics anyway.
     * @param {Actor|null|undefined} actor
     * @returns {boolean}
     */
    static isTargetDefeated(actor) {
        if (!actor) return false;
        const hits = actor.system?.attributes?.hits;
        if (hits) {
            const cur = Number(hits.current);
            if (Number.isFinite(cur) && cur <= 0) return true;
        }
        const combat = game.combat;
        if (combat?.combatants?.size) {
            const tokenId = actor.token?.id;
            for (const c of combat.combatants) {
                if (tokenId ? c.tokenId === tokenId : c.actorId === actor.id) {
                    if (c.defeated) return true;
                }
            }
        }
        return false;
    }
}