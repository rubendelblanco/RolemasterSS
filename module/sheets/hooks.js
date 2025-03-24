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

Hooks.on("hotbarDrop", async (bar, data, slot) => {
    if (data.type !== "Item") return;

    let item = await fromUuid(data.uuid);
    if (!item) return;

    let actor = item.actor;
    if (!actor) {
        return ui.notifications.warn("No puedes asignar una habilidad sin un actor.");
    }

    // Comando que se ejecutará al hacer clic en el macro
    let command = `
        let actor = game.actors.get("${actor.id}");
        if (!actor) return;
        let item = actor.items.get("${item.id}");
        if (!item) return;
        item.use();
    `;

    // Buscar si el macro ya existe (para evitar duplicados)
    let macro = game.macros.find(m => m.name === item.name && m.command === command);
    if (!macro) {
        macro = await Macro.create({
            name: item.name,
            type: "script",  // <-- IMPORTANTE: Asegurar que es un script
            img: item.img,
            command: command,
            flags: { "rmss.skillMacro": true }
        });
    }

    await game.user.assignHotbarMacro(macro, slot);
    console.log(`Macro asignado en slot ${slot}:`, macro);
});


