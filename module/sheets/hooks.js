Hooks.on("createToken", async (tokenDocument) => {
    if (tokenDocument.actor?.type === "character") {
        await tokenDocument.update({ actorLink: true });
    }
});

Hooks.on("createActor", async (actor) => {
    if (actor.type === "character") {
        await actor.update({ "token.actorLink": true });
    }
});
