Hooks.on("updateCombat", async (combat) => {
    for (let combatant of combat.combatants) {
        const actor = combatant.actor;
        if (!actor) continue;

        const tokenActor = combatant.token?.actor;

        for (let effect of actor.effects) {
            const duration = effect.duration;
            console.log("actor with effect:", actor);

            if (duration.rounds) {
                duration.rounds--;
                const tokenEffect = tokenActor.effects.find(e => e.name === effect.name);
                const actorEffect = actor.effects.get(tokenEffect.origin);
                console.log("Effect in round");
                console.log(await tokenEffect.update({ "duration.rounds": duration.rounds }));
                //await actor.update({ "effects": actor.effects });

                if (duration.rounds <= 0) {
                    console.log("actor before effect:", actor);
                    console.log("actorEffect:", actorEffect);
                    console.log("actor after effect:", actor);
                    if (actorEffect) {
                        console.log("Updating token effects:");
                       // await actorEffect.delete();
                        await actor.update({ "effects": actor.effects });
                    }

                    await effect.delete();

                    /*if (actor.type === "character" && tokenActor) {
                        const tokenEffect = tokenActor.effects.find(e => e.name === effect.name);
                        if (tokenEffect) await tokenEffect.delete();
                    }*/
                } else {
                   // await effect.update({ "duration.rounds": duration.rounds });

                   /* if (actor.type === "character" && tokenActor) {
                       // console.log("Updating token effects:");
                        const tokenEffect = tokenActor.effects.find(e => e.name === effect.name);

                        if (tokenEffect) {
                          //  console.log("el caso es entrar aqui");
                            await tokenEffect.update({ "duration.rounds": duration.rounds });
                            const actorEffect = actor.effects.find(e => e.name === tokenEffect.name);
                          //  console.log(actorEffect);
                            if (actorEffect) {
                                await actorEffect.update({ "duration.rounds": duration.rounds });
                            }
                            //await actor.update({ "effects": tokenActor.effects });
                        } else {
                            await tokenActor.createEmbeddedDocuments("ActiveEffect", [effect.toObject()]);
                        }

                    }*/
                }
            }
        }
    }
});
