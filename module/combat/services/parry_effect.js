import ParryService from "./parry_service.js";

const ICON_ACTIVE = "systems/rmss/assets/default/shield-parry.svg";
const ICON_USED = "systems/rmss/assets/default/shield-parry-used.svg";
const FLAG = "parryStance";

/**
 * Keeps one ActiveEffect on the actor in sync with its parry reservation, so the stance shows as
 * an icon on the token (and in the effect lists) instead of living only in the tracker.
 *
 * It is named "Parry +N" on purpose: the critical-hit "Parry" effect is matched by its exact
 * name for its round countdown, so this one never gets ticked or merged with it. Foundry only
 * paints an effect on the token when it has a finite duration, hence the long one; the effect is
 * created/updated/removed here and never expires by itself (the reservation flag owns its life).
 *
 * @param {Actor} actor
 * @returns {Promise<void>}
 */
export async function syncParryEffect(actor) {
    if (!actor?.effects) return;
    const existing = actor.effects.find((e) => e.getFlag?.("rmss", FLAG) === true || e.flags?.rmss?.[FLAG] === true);
    const reservation = ParryService.getReservation(actor);

    if (!reservation) {
        if (existing) await existing.delete();
        return;
    }

    const consumed = reservation.consumed === true;
    const name = game.i18n.format(consumed ? "rmss.parry.effect_name_used" : "rmss.parry.effect_name", { defense: reservation.defense });
    const img = consumed ? ICON_USED : ICON_ACTIVE;

    if (existing) {
        if (existing.name === name && existing.img === img) return;
        await existing.update({ name, img });
        return;
    }
    await actor.createEmbeddedDocuments("ActiveEffect", [{
        name,
        img,
        origin: actor.uuid,
        disabled: false,
        duration: { value: 999, units: "rounds" },
        flags: { rmss: { [FLAG]: true } }
    }]);
}
