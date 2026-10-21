import { chatMessageOtherStyle } from "../../chat/chatMessages.js";
import { buildEffectData } from "../../effects/effect_catalog.js";

/**
 * The "Unconscious" state a player character falls into when their hit points reach 0 (see hits_thresholds.js).
 *
 * It is an ActiveEffect flagged `flags.rmss.unconsciousFromHits`, and only that flag marks it as this one: someone who is
 * unconscious for another reason (a critical, a fumble) is handled by hand and is never woken up from here. Wounds,
 * bleeding and penalties are not touched; they go on as they would for a conscious character.
 */

const TEMPLATE = "systems/rmss/templates/chat/hits-state-card.hbs";
export const UNCONSCIOUS_FROM_HITS_FLAG = "unconsciousFromHits";

/** @returns {ActiveEffect[]} the unconscious effects this state put on the actor */
function findUnconsciousFromHits(actor) {
    return [...(actor?.effects ?? [])].filter((e) => e.flags?.rmss?.[UNCONSCIOUS_FROM_HITS_FLAG] === true);
}

async function postCard(actor, { title, icon, lines }) {
    const content = await renderTemplate(TEMPLATE, {
        actor: { name: actor.name, img: actor.img },
        title,
        icon,
        lines
    });
    return ChatMessage.create({
        speaker: ChatMessage.getSpeaker({ actor }),
        content,
        ...chatMessageOtherStyle()
    });
}

/**
 * Put the actor in the unconscious state for having lost their hit points. Does nothing if it already has it.
 * @param {Actor} actor
 */
export async function applyUnconsciousFromHits(actor) {
    if (!actor || findUnconsciousFromHits(actor).length) return;
    // Same large duration the "Dead" effect uses, so Foundry renders it reliably; it is removed by hand or on waking
    await actor.createEmbeddedDocuments("ActiveEffect", [
        buildEffectData("unconscious", { origin: actor.uuid, iconsFolder: CONFIG.rmss.paths.icons_folder, rmss: { [UNCONSCIOUS_FROM_HITS_FLAG]: true } })
    ]);

    const limit = Math.max(0, Number(actor.system?.stats?.constitution?.temp) || 0);
    await postCard(actor, {
        title: game.i18n.localize("rmss.hits_state.unconscious_title"),
        icon: "💤",
        lines: [
            game.i18n.format("rmss.hits_state.unconscious_line", { name: actor.name }),
            game.i18n.format("rmss.hits_state.death_limit_line", { limit })
        ]
    });
}

/**
 * Take the unconscious state off an actor that has it for hit points: they woke up (announce) or died (silently).
 * @param {Actor} actor
 * @param {{ announce?: boolean }} [options]
 */
export async function removeUnconsciousFromHits(actor, { announce = true } = {}) {
    const effects = findUnconsciousFromHits(actor);
    if (!effects.length) return;
    await actor.deleteEmbeddedDocuments("ActiveEffect", effects.map((e) => e.id));
    if (!announce) return;
    await postCard(actor, {
        title: game.i18n.localize("rmss.hits_state.awake_title"),
        icon: "☀️",
        lines: [game.i18n.format("rmss.hits_state.awake_line", { name: actor.name })]
    });
}
