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

Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type !== "Item" || !data.uuid) return;
    // Ejecutar lógica async en segundo plano; devolver false INMEDIATAMENTE
    // para evitar race condition con el manejo por defecto de Foundry
    _handleItemHotbarDrop(data, slot).catch(err => {
        console.error("[RMSS] hotbarDrop error:", err);
        ui.notifications.error("Error al asignar al hotbar");
    });
    return false;
});

async function _handleItemHotbarDrop(data, slot) {
    const item = await fromUuid(data.uuid);
    if (!item) return;

    const actorId = item.actor?.id ?? null;
    if (!actorId) {
        ui.notifications.warn("No puedes asignar un ítem sin un actor.");
        return;
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

    const existingMacro = game.macros.find(m => m.name === item.name && m.type === "script");
    if (existingMacro) {
        await game.user.assignHotbarMacro(null, slot);
    }

    const macro = await Macro.create({
        name: item.name,
        type: "script",
        img: item.img,
        command: command,
        flags: { "rmss.skillMacro": true }
    }, { temporary: false });

    await game.user.assignHotbarMacro(macro, slot);
    ui.notifications.info(`Macro ${macro.name} asignado al slot ${slot}`);
}


Hooks.once('hotbarReady', () => {
    game.user.hotbar.render();
});



