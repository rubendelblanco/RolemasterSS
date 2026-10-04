import { chatMessageOtherStyle, whisperIdsForOwnersAndGMs } from "../../chat/chatMessages.js";
import ParryService from "./parry_service.js";

const TEMPLATE = "systems/rmss/templates/chat/parry-message.hbs";

/**
 * Chat cards for the parry reservation, in the same style as the other combat cards (actor
 * portrait, title, body). Public ones announce a change; whispered ones (owner + GMs) remind
 * the player their stance is active when their turn starts.
 */
export default class ParryChat {

    /** @private */
    static async _post(actor, { title, lines, button = null }, { whisper = false } = {}) {
        const content = await renderTemplate(TEMPLATE, {
            actor: { name: actor.name, img: actor.img },
            actorUuid: actor.uuid,
            title,
            lines,
            button
        });
        return ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            ...chatMessageOtherStyle(),
            ...(whisper ? { whisper: whisperIdsForOwnersAndGMs(actor) } : {})
        });
    }

    static postReserved(actor, reservation) {
        return ParryChat._post(actor, {
            title: game.i18n.localize("rmss.parry.card_reserved_title"),
            lines: [
                game.i18n.format("rmss.parry.card_reserved_line", { points: reservation.points, defense: reservation.defense }),
                game.i18n.localize("rmss.parry.card_stays_line")
            ]
        });
    }

    static postCleared(actor) {
        return ParryChat._post(actor, {
            title: game.i18n.localize("rmss.parry.card_cleared_title"),
            lines: [game.i18n.localize("rmss.parry.card_cleared_line")]
        });
    }

    /** Whispered at the start of the owner's turn, while the stance is active. */
    static postTurnReminder(actor, reservation) {
        const lines = [
            game.i18n.format("rmss.parry.card_reminder_line", { points: reservation.points, defense: reservation.defense }),
            game.i18n.format("rmss.parry.card_reminder_attack_line", { points: reservation.points })
        ];
        if (ParryService.hasNoParryEffect(actor)) lines.push(game.i18n.localize("rmss.parry.card_reminder_suspended"));
        return ParryChat._post(actor, {
            title: game.i18n.localize("rmss.parry.card_reminder_title"),
            lines,
            button: game.i18n.localize("rmss.parry.card_change_button")
        }, { whisper: true });
    }

    /**
     * A "must parry" critical landed.
     * @param {Actor} actor
     * @param {{ reservation: object|null, penalty: number, rounds: number }} info
     */
    static postMustParry(actor, { reservation, penalty, rounds }) {
        const lines = [];
        if (ParryService.hasNoParryEffect(actor)) {
            lines.push(game.i18n.localize("rmss.parry.card_must_parry_no_parry"));
        } else if (reservation) {
            lines.push(game.i18n.format("rmss.parry.card_must_parry_reserved", { points: reservation.points, defense: reservation.defense }));
        } else {
            lines.push(game.i18n.localize("rmss.parry.card_must_parry_no_weapon"));
        }
        if (penalty) lines.push(game.i18n.format("rmss.parry.card_must_parry_penalty", { penalty, rounds }));
        return ParryChat._post(actor, { title: game.i18n.localize("rmss.parry.card_must_parry_title"), lines });
    }

    /** The stance was dropped because the weapon it was made with is no longer usable. */
    static postDropped(actor) {
        return ParryChat._post(actor, {
            title: game.i18n.localize("rmss.parry.card_dropped_title"),
            lines: [game.i18n.localize("rmss.parry.card_dropped_line")]
        }, { whisper: true });
    }
}
