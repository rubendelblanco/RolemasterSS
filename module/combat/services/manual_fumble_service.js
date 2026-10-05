import WeaponFumbleService from "./weapon_fumble_service.js";
import SpellFailureService from "../../spells/services/spell_failure_service.js";
import { withPublicRollMode } from "../../chat/chatMessages.js";

/**
 * Fumbles and spell failures rolled on purpose, from the RMSS Effects popup (token HUD), for
 * the cases the system does not detect by itself: a house rule, a botched maneuver, a trap...
 * Anyone can do it, so the GM doesn't have to roll everything for the table.
 */

/** Spell families of the spell failure table: one entry per column, with a representative spell type. */
export const SPELL_FAILURE_CHOICES = [
    { type: "BE", column: "elemental", key: "elemental" },
    { type: "F", column: "force", key: "force" },
    { type: "I", column: "informational", key: "informational" },
    { type: "E", column: "other", key: "other" }
];

export const SPELL_FAILURE_CODES = ["failure", "absolute_failure", "spectacular_failure"];

/**
 * A typed roll: blank means "roll the dice for me".
 * @param {string|number|null|undefined} raw
 * @param {{ min?: number, max?: number }} [limits]
 * @returns {{ roll: number|null, invalid: boolean }} roll is null when blank or invalid
 */
export function parseManualRoll(raw, { min = 1, max = Infinity } = {}) {
    const text = String(raw ?? "").trim();
    if (text === "") return { roll: null, invalid: false };
    const n = Number(text);
    if (!Number.isInteger(n) || n < min || n > max) return { roll: null, invalid: true };
    return { roll: n, invalid: false };
}

/**
 * Weapon fumble: roll (or take the typed value) and post the usual fumble card.
 * @param {{ actor: Actor, weapon?: Item|null, weaponType?: string, roll?: number|null }} params
 *   weapon is a real weapon item; otherwise weaponType picks the column ("1he", "2h", "pa1h", "th", "mis"...).
 * @returns {Promise<{ roll: number, column: string }>}
 */
export async function postWeaponFumble({ actor, weapon = null, weaponType = "1he", roll = null }) {
    const type = weapon?.system?.type || weaponType;
    const column = WeaponFumbleService.getColumnForWeaponType(type);

    let value = roll;
    let rollObj = null;
    if (value == null) {
        rollObj = new Roll("1d100");
        await rollObj.evaluate();
        value = rollObj.total;
        if (game.dice3d) await game.dice3d.showForRoll(rollObj, game.user, true);
    }

    // A generic type has no item: show its name on the card instead of an empty weapon.
    const shown = weapon ?? { name: game.i18n.localize(`rmss.weapon.type_cod.${type}`), system: { type } };
    const { RMSSWeaponCriticalManager } = await import("../rmss_weapon_critical_manager.js");
    await RMSSWeaponCriticalManager.getWeaponFumbleMessage(actor, shown, value, rollObj);
    return { roll: value, column };
}

/**
 * Spell failure: roll on the spell failure table and post a card.
 * @param {{ actor: Actor, spellType: string, failureCode?: string, castingModifiers?: number, roll?: number|null }} params
 * @returns {Promise<object|null>} the failure result, or null if the table could not be loaded
 */
export async function postSpellFailure({ actor, spellType, failureCode = "failure", castingModifiers = 0, roll = null }) {
    const result = await SpellFailureService.rollFailure(spellType, failureCode, castingModifiers, true, roll);
    if (!result) return null;

    const content = await renderTemplate("systems/rmss/templates/chat/spell-failure-result.hbs", {
        actor: { name: actor.name, img: actor.img },
        failureLabel: game.i18n.localize(`rmss.manual_fumble.code_${failureCode}`),
        columnLabel: game.i18n.localize(`rmss.manual_fumble.column_${result.column}`),
        modifiers: castingModifiers,
        ...result
    });
    await ChatMessage.create(withPublicRollMode({
        content,
        speaker: { alias: "Game Master" }
    }));
    return result;
}
