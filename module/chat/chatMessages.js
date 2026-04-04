/** @returns {boolean} */
export function isNpcOrCreatureActor(actor) {
    const t = actor?.type;
    return t === "npc" || t === "creature";
}

/**
 * GM-only whisper for NPC/creature rolls when not public.
 * @param {Actor} actor
 * @param {boolean} publicToPlayers
 * @returns {string[]|undefined} User ids, or undefined when message should be public
 */
export function whisperIdsForNpcRollPrivacy(actor, publicToPlayers) {
    if (publicToPlayers || !isNpcOrCreatureActor(actor)) return undefined;
    const ids = game.users.filter((u) => u.isGM).map((u) => u.id);
    return ids.length ? ids : undefined;
}

/**
 * Dice So Nice: sync 3d dice to all clients when the roll is public (or actor is a PC).
 */
export function dice3dSynchronizeForNpcRoll(actor, publicToPlayers) {
    return publicToPlayers || !isNpcOrCreatureActor(actor);
}

/**
 * Combat attack chat (weapon, creature_attack, etc.): always public roll/chat visibility.
 * Overrides the user's default roll mode so GM attacks are not accidentally private.
 * @param {object} messageData - ChatMessage.create data
 * @returns {object}
 */
export function withPublicRollMode(messageData) {
    const data = { ...messageData };
    if (typeof CONST !== "undefined" && CONST.DICE_ROLL_MODES?.PUBLIC !== undefined) {
        data.rollMode = CONST.DICE_ROLL_MODES.PUBLIC;
    }
    return data;
}

//Called when a experience info message is sended
export async function sendExpMessage(actor, expBreakdown, expAmount) {
    const templatePath = "systems/rmss/templates/chat/exp-message.hbs";
    const data = {
        actorName: actor.name,
        expGained: expAmount,
        expBreakdown: expBreakdown,
    };

    const content = await renderTemplate(templatePath, data);

    // Crear un Set para evitar duplicados
    const whispers = new Set();

    // Agregar todos los owners del actor
    const owners = game.users.filter(user => actor.testUserPermission(user, "OWNER"));
    owners.forEach(user => whispers.add(user.id));

    // Agregar todos los GMs
    const gms = game.users.filter(user => user.isGM);
    gms.forEach(user => whispers.add(user.id));

    ChatMessage.create({
        content: content,
        speaker: { alias: "Game Master" },
        whisper: Array.from(whispers)
    });
}
