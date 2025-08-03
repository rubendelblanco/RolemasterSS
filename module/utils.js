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

    static getActor(actorOrTokenOrId) {
        if (actorOrTokenOrId instanceof Actor) {
            return actorOrTokenOrId;
        }

        if (actorOrTokenOrId instanceof Token) {
            return token.actor;
        }

        // tokenId?
        let actor = canvas.tokens.get(actorOrTokenOrId)?.actor;
        if (actor){
            return actor;
        }

        // actorId?
        return game.actors.get(actorOrTokenOrId);
    }
}