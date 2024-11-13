export class RMSSCombatant extends Combatant {
    async startTurn() {
        const actor = this.actor;

        if (actor.system.condition.hits_per_rounds > 0) {
            actor.system.attributes.hits.current -= parseInt(actor.system.condition.hits_per_rounds);
            await actor.update({ "system.attributes.hits.current": actor.system.attributes.hits.current });
        }

    }
}
