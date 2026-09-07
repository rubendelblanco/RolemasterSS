Hooks.on("createToken", async (tokenDocument) => {
    if (["character", "npc"].includes(tokenDocument.actor?.type)) {
        await tokenDocument.update({ actorLink: true });
    }
});

Hooks.on("createActor", async (actor) => {
    if (["character", "npc"].includes(actor.type)) {
        await actor.update({ prototypeToken: { actorLink: true } });
    }
});

Hooks.on("hotbarDrop", (bar, data, slot) => {
    if (data.type !== "Item" || !data.uuid) return;
    // Run async logic in the background; return false immediately
    // to avoid a race with Foundry's default hotbar handling
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



