/**
 * Combat events -> world macros. The system only says "this happened" and runs whatever macro the
 * GM wrote in the system settings for that event; it knows nothing about animations or modules.
 *
 * Today the only event is MELEE_MISS (a melee attack that deals no damage and no critical). Adding
 * another event is one entry in EVENTS plus one fireCombatEvent call where it happens.
 *
 * The macro runs on the GM's client (players usually can't execute script macros) with the scope
 * { actor, token, target, targets, weapon, event }, the same names the ammo macros get. Note that
 * scope keys become function parameters, so a macro must not redeclare them with const/let.
 */
export const COMBAT_EVENT = { MELEE_MISS: "meleeMiss" };

const EVENTS = {
    [COMBAT_EVENT.MELEE_MISS]: { setting: "macroOnMeleeMiss", label: "melee_miss" }
};

export const COMBAT_EVENT_SETTINGS = Object.values(EVENTS);

/** Missile weapons are the only non-melee attacks; creature attacks and ordinary weapons count as melee. */
export function isMeleeAttack(weapon) {
    if (!weapon) return false;
    if (weapon.type !== "weapon" && weapon.type !== "creature_attack") return false;
    return weapon.system?.type !== "mis";
}

/** UUID of the macro configured for an event, or "" when none. */
export function getEventMacroUuid(event) {
    const def = EVENTS[event];
    if (!def) return "";
    try {
        return String(game.settings.get("rmss", def.setting) ?? "").trim();
    } catch {
        return "";
    }
}

const uuidOf = (token) => token?.document?.uuid ?? token?.uuid ?? null;

/**
 * Announce a combat event. Never throws and never blocks the attack: a broken macro must not
 * break combat.
 * @param {string} event - one of COMBAT_EVENT
 * @param {{ actor: Actor, weapon?: Item, attackerToken?: Token, defenderToken?: Token }} ctx
 * @param {{ runner?: (data: object) => Promise<any> }} [options] - how the GM-side run is requested
 *   (defaults to the system socket); injected by the tests.
 */
export async function fireCombatEvent(event, ctx, { runner } = {}) {
    try {
        const macroUuid = getEventMacroUuid(event);
        if (!macroUuid) return;

        const data = {
            event,
            macroUuid,
            actorUuid: ctx.actor?.uuid ?? null,
            weaponUuid: ctx.weapon?.uuid ?? null,
            attackerTokenUuid: uuidOf(ctx.attackerToken),
            defenderTokenUuid: uuidOf(ctx.defenderToken)
        };

        if (runner) return await runner(data);
        const { socket } = await import("../../../rmss.js");
        return await socket.executeAsGM("runCombatEventMacro", data);
    } catch (e) {
        console.error("rmss | combat event macro", e);
    }
}

/** GM side (registered as a socket action): resolve the uuids and run the macro. */
export async function runCombatEventMacro(data) {
    try {
        const macro = await fromUuid(data.macroUuid);
        if (!macro || macro.documentName !== "Macro") {
            ui.notifications?.warn(game.i18n.format("rmss.combat_events.macro_not_found", { uuid: data.macroUuid }));
            return;
        }
        const [actor, weapon, attackerDoc, defenderDoc] = await Promise.all([
            data.actorUuid ? fromUuid(data.actorUuid) : null,
            data.weaponUuid ? fromUuid(data.weaponUuid) : null,
            data.attackerTokenUuid ? fromUuid(data.attackerTokenUuid) : null,
            data.defenderTokenUuid ? fromUuid(data.defenderTokenUuid) : null
        ]);
        // Canvas tokens (macros read .x/.y/.document); null when that scene isn't the one being viewed.
        const token = attackerDoc?.object ?? null;
        const target = defenderDoc?.object ?? null;
        await macro.execute({
            event: data.event,
            actor: actor ?? token?.actor ?? null,
            weapon: weapon ?? null,
            token,
            target,
            targets: target ? [target] : []
        });
    } catch (e) {
        console.error("rmss | combat event macro (GM)", e);
    }
}

/** Register the macro settings. Called from the i18nInit hook (labels need the translations). */
export function registerCombatEventSettings() {
    for (const def of COMBAT_EVENT_SETTINGS) {
        game.settings.register("rmss", def.setting, {
            name: game.i18n.localize(`rmss.combat_events.${def.label}_name`),
            hint: game.i18n.localize(`rmss.combat_events.${def.label}_hint`),
            scope: "world",
            config: true,
            type: String,
            default: ""
        });
    }
}
