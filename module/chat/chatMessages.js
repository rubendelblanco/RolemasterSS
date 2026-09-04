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
 * Whisper to the actor's own owners (players) plus every GM - for messages meant only for the
 * character's table seat, regardless of actor type (e.g. long rest, level up).
 * @param {Actor} actor
 * @returns {string[]} User ids (always includes GMs even if the actor has no player owner)
 */
export function whisperIdsForOwnersAndGMs(actor) {
    const ids = new Set();
    (game.users ?? []).filter((u) => actor?.testUserPermission?.(u, "OWNER")).forEach((u) => ids.add(u.id));
    (game.users ?? []).filter((u) => u.isGM).forEach((u) => ids.add(u.id));
    return Array.from(ids);
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

/**
 * Cross-version-safe {style|type} field for a "plain" ChatMessage. Foundry v13 removed
 * CONST.CHAT_MESSAGE_TYPES entirely in favor of CONST.CHAT_MESSAGE_STYLES (the ChatMessage
 * field itself was renamed type -> style). Spread the result into ChatMessage.create() data.
 * @returns {{style: number}|{type: number}}
 */
export function chatMessageOtherStyle() {
    return CONST.CHAT_MESSAGE_STYLES
        ? { style: CONST.CHAT_MESSAGE_STYLES.OTHER }
        : { type: CONST.CHAT_MESSAGE_TYPES.OTHER };
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
