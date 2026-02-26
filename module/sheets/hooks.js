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

    let actorId = item.actor ? item.actor.id : null;
    if (!actorId) {
        return ui.notifications.warn("No puedes asignar una habilidad sin un actor.");
    }

    const isSpell = item.type === "spell";
    const command = isSpell
      ? `
        const actor = game.actors.get("${actorId}");
        if (!actor) return;
        const item = actor.items.get("${item.id}");
        if (!item) return;
        await game.rmss.castSpellFromHotbar(actor.id, item.id);
    `
      : `
        const actor = game.actors.get("${actorId}");
        if (!actor) return;
        const item = actor.items.get("${item.id}");
        if (!item) return;
        await item.use();
    `;

    console.log("Comando del macro:", command);

    let existingMacro;

    existingMacro = game.macros.find(m => m.name === item.name && m.type === "script");
    if (existingMacro) {
        await game.user.assignHotbarMacro(null, slot);
    }

    let macro = await Macro.create({
        name: item.name,
        type: "script",
        img: item.img,
        command: command,
        flags: { "rmss.skillMacro": true }
    }, { temporary: false });

    console.log("Macro creado:", macro);

    await game.user.assignHotbarMacro(macro, slot);
    await game.macros.get(macro.id)?.update({ command: command });

    ui.notifications.info(`Macro ${macro.name} asignado al slot ${slot}`);
});


Hooks.once('hotbarReady', () => {
    game.user.hotbar.render();
});



