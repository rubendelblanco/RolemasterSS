import { normalizeTagArray } from "../../sheets/items/item_tags_ui.js";

/**
 * Special properties of ammunition (arrows, bolts, bullets), stored in `system.ammo_effects`:
 * an extra critical ("Effect Weapon", like fire arrows), Increased Critical, Weapon of Bleeding,
 * and the magical / holy / unholy / slaying properties a weapon can also have. They apply to the
 * shot made with that ammo, on top of the bow's own.
 *
 * The ammo can be used up (deleted) by the time the critical is rolled, so what travels with the
 * attack is a small plain snapshot (see {@link snapshotAmmo}), never the item itself.
 */

export const AMMO_EFFECT_DEFAULTS = Object.freeze({
    effect_weapon: "",
    effect_weapon_critical_type: "",
    effect_weapon_fixed_severity: "",
    increased_critical: false,
    weapon_of_bleeding: false,
    magical: false,
    holy: false,
    unholy: false,
    slaying: [],
    isSlaying: false,
    slaying_bonus: 0
});

/**
 * @param {object} system - ammo item.system
 * @returns {typeof AMMO_EFFECT_DEFAULTS} the effects with defaults filled in
 */
export function getAmmoEffects(system) {
    const raw = system?.ammo_effects ?? {};
    return {
        effect_weapon: String(raw.effect_weapon ?? ""),
        effect_weapon_critical_type: String(raw.effect_weapon_critical_type ?? ""),
        effect_weapon_fixed_severity: String(raw.effect_weapon_fixed_severity ?? ""),
        increased_critical: raw.increased_critical === true,
        weapon_of_bleeding: raw.weapon_of_bleeding === true,
        magical: raw.magical === true,
        holy: raw.holy === true,
        unholy: raw.unholy === true,
        slaying: normalizeTagArray(raw.slaying),
        isSlaying: raw.isSlaying === true,
        slaying_bonus: Number(raw.slaying_bonus) || 0
    };
}

/** @returns {boolean} true when the effects set nothing at all */
export function isEmptyAmmoEffects(effects) {
    return !effects
        || (!effects.effect_weapon && !effects.effect_weapon_critical_type && !effects.effect_weapon_fixed_severity
            && !effects.increased_critical && !effects.weapon_of_bleeding
            && !effects.magical && !effects.holy && !effects.unholy
            && !effects.isSlaying && !(effects.slaying?.length) && !effects.slaying_bonus);
}

/**
 * Compact plain copy of an ammo item's effects, or null when it has none.
 * @param {Item|null} ammoItem
 * @returns {{ name: string, effects: typeof AMMO_EFFECT_DEFAULTS }|null}
 */
export function snapshotAmmo(ammoItem) {
    if (!ammoItem) return null;
    const effects = getAmmoEffects(ammoItem.system);
    if (isEmptyAmmoEffects(effects)) return null;
    return { name: ammoItem.name ?? "", effects };
}

/**
 * Weapon-shaped view of an ammo snapshot, so the weapon code (effect weapon, slaying, holy...)
 * can read it the same way as a weapon.
 * @param {{ name?: string, effects?: object }|null} snapshot
 * @returns {{ type: "weapon", name: string, system: object }|null}
 */
export function ammoAsWeaponLike(snapshot) {
    const e = snapshot?.effects;
    if (!e) return null;
    return {
        type: "weapon",
        name: snapshot.name ?? "",
        system: {
            magical: e.magical === true,
            holy: e.holy === true,
            unholy: e.unholy === true,
            slaying: normalizeTagArray(e.slaying),
            isSlaying: e.isSlaying === true,
            slaying_bonus: Number(e.slaying_bonus) || 0,
            weapon_effects: {
                effect_weapon: e.effect_weapon ?? "",
                effect_weapon_critical_type: e.effect_weapon_critical_type ?? "",
                effect_weapon_fixed_severity: e.effect_weapon_fixed_severity ?? "",
                increased_critical: e.increased_critical === true,
                weapon_of_bleeding: e.weapon_of_bleeding === true
            }
        }
    };
}

/** Snapshot -> string for a chat button's data attribute ("" when there is none). */
export function encodeAmmo(snapshot) {
    return snapshot ? JSON.stringify(snapshot) : "";
}

/** The reverse of {@link encodeAmmo}; null for anything that is not a valid snapshot. */
export function decodeAmmo(text) {
    if (!text) return null;
    try {
        const parsed = JSON.parse(text);
        return parsed && typeof parsed === "object" && parsed.effects ? parsed : null;
    } catch {
        return null;
    }
}

/**
 * Which macro runs for a missile shot: the ammo's own if it has one (so a lightning bolt can
 * have a flashier animation than the bow's), otherwise the bow's.
 * @param {Item|null} weapon
 * @param {Item|null} ammoItem
 * @returns {{ owner: Item, command: string, name: string }|null}
 */
export function pickAttackMacro(weapon, ammoItem) {
    const read = (item) => {
        const data = item?.getFlag?.("rmss", "macro") ?? item?.flags?.rmss?.macro;
        return data?.command?.trim() ? data : null;
    };
    const ammoMacro = read(ammoItem);
    if (ammoMacro) return { owner: ammoItem, command: ammoMacro.command, name: ammoMacro.name || `${ammoItem.name} Macro` };
    const weaponMacro = read(weapon);
    if (weaponMacro) return { owner: weapon, command: weaponMacro.command, name: weaponMacro.name || `${weapon.name} Macro` };
    return null;
}

/**
 * Run the macro for a confirmed missile shot. It gets what item macros get (item, actor, token,
 * spellContext = null) plus the shot's own context: weapon, ammo, target and targets.
 * `item` is whichever item owns the macro that runs (the ammo when it overrides the bow).
 */
export async function runAttackMacro({ weapon, ammoItem, actor, attackerToken, defenderToken }) {
    const picked = pickAttackMacro(weapon, ammoItem);
    if (!picked) return;
    try {
        const macro = new Macro({ name: picked.name, type: "script", command: picked.command });
        await macro.execute({
            item: picked.owner,
            weapon,
            ammo: ammoItem ?? null,
            actor,
            token: attackerToken ?? actor?.getActiveTokens?.()?.[0] ?? null,
            target: defenderToken ?? null,
            targets: defenderToken ? [defenderToken] : [],
            spellContext: null
        });
    } catch (err) {
        console.error("rmss | ammo/weapon macro", err);
        ui.notifications.error(`Macro error: ${err.message}`);
    }
}
