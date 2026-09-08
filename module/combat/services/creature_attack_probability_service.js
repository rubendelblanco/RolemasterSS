/**
 * Weighted-random pick among a creature's own attacks, driven by each attack's own
 * system.probability field (e.g. Bite 70, Claw 30) instead of the GM manually rolling
 * percentile dice outside the app to decide which attack a creature uses this round.
 */
export default class CreatureAttackProbabilityService {
    /**
     * Roll 1d100 and pick whichever creature_attack it lands on, walking cumulative
     * probability in system.order (the same ordering the chain-reminder logic uses - see
     * RMSSWeaponCriticalManager.postCreatureAttackSpecialChainGmReminder). Attack 1 covers
     * [1, p1], attack 2 covers [p1+1, p1+p2], etc. - the classic RM percentile-range table
     * convention, not an abstract weight/total ratio.
     *
     * If the probabilities don't sum to 100 (GM data-entry drifted), a roll past the last
     * cumulative threshold falls back to the last attack in order rather than resolving to
     * nothing.
     * @param {Actor} actor
     * @returns {Promise<{ attack: Item, roll: Roll|null }|null>} null if the actor has no creature_attack items
     */
    static async rollAttackChoice(actor) {
        const attacks = (actor?.items ?? [])
            .filter((i) => i.type === "creature_attack")
            .sort((a, b) => {
                const oa = Number(a.system?.order);
                const ob = Number(b.system?.order);
                return (Number.isFinite(oa) ? oa : 9999) - (Number.isFinite(ob) ? ob : 9999);
            });
        if (!attacks.length) return null;
        if (attacks.length === 1) return { attack: attacks[0], roll: null };

        const roll = await new Roll("1d100").evaluate();
        if (game.dice3d) await game.dice3d.showForRoll(roll, game.user, true);

        let cumulative = 0;
        for (const attack of attacks) {
            cumulative += Math.max(0, Number(attack.system?.probability) || 0);
            if (roll.total <= cumulative) return { attack, roll };
        }
        return { attack: attacks[attacks.length - 1], roll };
    }
}
