// Storing an item inside a container (a plain "item" container or a transport) while it's
// still equipped/worn makes no sense - you can't wield a weapon or wear armor that's packed
// away. This one hook covers every drop handler across every actor/item sheet that sets
// flags.rmss.containerId (character/npc/creature sheets, item/weapon/armor/transport sheets)
// instead of duplicating the same fixup at each call site. Spell items also reuse
// flags.rmss.containerId (to link a spell to its owning spell_list, an unrelated concept) but
// have no equipped/worn field, so the type guard below already leaves them untouched.
Hooks.on("preUpdateItem", (item, changes) => {
    if (!foundry.utils.hasProperty(changes, "flags.rmss.containerId")) return;
    if (!foundry.utils.getProperty(changes, "flags.rmss.containerId")) return;

    if ((item.type === "weapon" || item.type === "armor") && item.system?.equipped) {
        foundry.utils.mergeObject(changes, { system: { equipped: false } });
    } else if (item.type === "item" && item.system?.worn) {
        foundry.utils.mergeObject(changes, { system: { worn: false } });
    }
});

Hooks.on("createToken", async (tokenDocument) => {
    if (["character", "npc"].includes(tokenDocument.actor?.type)) {
        await tokenDocument.update({ actorLink: true });
    }
});

Hooks.on("createActor", async (actor) => {
    if (["character", "npc"].includes(actor.type)) {
        await actor.update({
            prototypeToken: {
                actorLink: true,
                sight: { enabled: true, range: 50 }
            }
        });
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



