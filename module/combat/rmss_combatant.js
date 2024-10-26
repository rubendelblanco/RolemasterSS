export class RMSSCombatant extends Combatant {
    async startTurn() {
        console.log("Starting Turn");
        const actor = this.actor;

        if (actor.system.condition.hits_per_rounds > 0) {
            actor.system.attributes.hits.current -= parseInt(actor.system.condition.hits_per_rounds);
            await actor.update({ "system.attributes.hits.current": actor.system.attributes.hits.current });
        }

        if (actor.system.condition.stunned > 0) {
            await actor.update({ "system.condition.stunned": system.condition.stunned-- });
        }

        if (actor.system.condition.no_parry > 0) {
            await actor.update({ "system.condition.no_parry": system.condition.no_parry-- });
        }

    }
}
