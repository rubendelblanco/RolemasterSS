/**
 * World setting that works as a safety switch for the parry rules (see ParryService):
 * - full:   everything automatic (reservation, attack dialog, "must parry" criticals, shield by facing).
 * - manual: the reservation, tracker badge, token icon and chat cards still work as a record, but
 *           nothing is applied by itself: the attack dialog isn't pre-filled, "must parry" criticals
 *           force nothing and add no penalty.
 * - off:    none of the parry features; the shield rule by facing is off too, so combat behaves as
 *           it did before parry existed ("Parry" criticals only leave their indicator effect).
 */
export const PARRY_MODE = { FULL: "full", MANUAL: "manual", OFF: "off" };

const SETTING = "parryMode";

export function getParryMode() {
    try {
        const mode = game.settings.get("rmss", SETTING);
        return Object.values(PARRY_MODE).includes(mode) ? mode : PARRY_MODE.FULL;
    } catch {
        return PARRY_MODE.FULL;
    }
}

/** Parry exists at all (UI, reminders, token icon). */
export const isParryEnabled = () => getParryMode() !== PARRY_MODE.OFF;
/** Parry is applied by the system (attack dialog, forced reservation, penalty). */
export const isParryAutomatic = () => getParryMode() === PARRY_MODE.FULL;
/** Shields only count against frontal attacks. */
export const isShieldFacingEnabled = () => getParryMode() !== PARRY_MODE.OFF;

/**
 * Register the setting. Called from the i18nInit hook (not init), because the choice labels
 * need the translations, which are only loaded after init.
 */
export function registerParrySetting() {
    game.settings.register("rmss", SETTING, {
        name: game.i18n.localize("rmss.parry.setting_name"),
        hint: game.i18n.localize("rmss.parry.setting_hint"),
        scope: "world",
        config: true,
        type: String,
        choices: {
            [PARRY_MODE.FULL]: game.i18n.localize("rmss.parry.setting_full"),
            [PARRY_MODE.MANUAL]: game.i18n.localize("rmss.parry.setting_manual"),
            [PARRY_MODE.OFF]: game.i18n.localize("rmss.parry.setting_off")
        },
        default: PARRY_MODE.FULL,
        onChange: async () => {
            ui.combat?.render();
            if (!game.user.isActiveGM) return;
            // The token icons follow the mode: show or remove them for everyone in play.
            const { syncParryEffect } = await import("./parry_effect.js");
            const actors = new Set(game.combat?.combatants.map((c) => c.actor).filter(Boolean) ?? []);
            for (const actor of game.actors) if (actor.getFlag("rmss", "parry")) actors.add(actor);
            for (const actor of actors) await syncParryEffect(actor).catch((e) => console.error("rmss | parry resync", e));
        }
    });
}
