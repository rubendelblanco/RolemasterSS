import EquipmentService from "../../actors/services/equipment_service.js";
import FacingService from "./facing_service.js";

/**
 * Parry (parada).
 *
 * A combatant can reserve some of their offensive bonus (OB) to parry instead of attack,
 * always at 1 OB = 1 DB. What varies is how much of the OB may be reserved:
 * - 1-handed weapons: up to 100 % of the OB.
 * - Two-handed and pole weapons: up to 50 %.
 * - Creature attacks carry their own `parry_limit` (100 by default, GM can set 50).
 * - Stunned: up to 50 %. It does not stack with a weapon's own 50 % (the lowest cap wins).
 * - Missile (mis) and thrown (th) weapons can't parry; a weapon in hand is required.
 *
 * A reservation is a standing stance stored on the actor (flags.rmss.parry), readable by every client:
 *   { points, defense, capPercent, requested, ob, weaponId, weaponName, consumed, paid, combatId }
 * - `points`  OB taken out of the actor's attacks, every round, while the stance lasts.
 * - `defense` DB granted to the ONE attack that is parried; equals points. Once it parries an
 *   attack it is `consumed` until the owner's next turn starts, when it is re-armed.
 * - `requested`/`ob` what the player asked for and the OB it was computed from, so the caps can
 *   be re-applied at each re-arm (e.g. the actor got stunned, or recovered).
 * - `paid` the owner has made an attack with the stance on, so its OB cost has actually been
 *   charged. Until then a player can raise it but not lower or release it (otherwise parrying
 *   first and releasing before attacking would be a free parry); the GM always can.
 * It lasts until the owner changes or releases it, the weapon is gone, or the combat ends.
 *
 * "Must parry" criticals (effect "Parry", one per critical with its own rounds and value) force a
 * minimum reservation of half the OB that can't be lowered or released while any is active, and
 * their values add up as a penalty on every attack the victim makes (not on DB or RR). "No parry"
 * wins over it: with it there is no parry to force, only the penalty.
 *
 * It only applies to frontal melee attacks; never to missiles, thrown weapons or spells.
 */

/** Weapon `system.type` values that can neither parry nor be parried. */
const NO_PARRY_TYPES = ["mis", "th"];
/** Weapon `system.type` values limited to 50 % of the OB for parrying. */
const HALF_OB_TYPES = ["2h", "pa1h", "pa2h"];
/** Share of the OB that can be reserved while stunned. */
const STUNNED_CAP = 50;
/**
 * Share of the OB a "must parry" critical forces onto parry. House rule: the manual only requires
 * 1 point, which would make the critical meaningless, so we ask for half the OB.
 */
const MUST_PARRY_MIN_PERCENT = 50;

const FLAG_SCOPE = "rmss";
const FLAG_KEY = "parry";

export const PARRY_REASON = {
    NONE: "none",
    CONSUMED: "consumed",
    NO_PARRY: "no_parry",
    SPELL: "spell",
    NOT_PARRYABLE: "not_parryable",
    NOT_FRONT: "not_front"
};

export default class ParryService {

    // --- Weapon rules -----------------------------------------------------------

    /**
     * Can this item be used to parry (i.e. is it a melee weapon or a creature attack)?
     * @param {Item} item - weapon or creature_attack
     * @returns {boolean}
     */
    static canParryWith(item) {
        if (!item) return false;
        if (item.type === "creature_attack") return true;
        if (item.type !== "weapon") return false;
        return !NO_PARRY_TYPES.includes(item.system?.type);
    }

    /**
     * Share (percent) of the OB that this item alone allows to reserve for parrying.
     * @param {Item} item
     * @returns {100|50}
     */
    static getItemCapPercent(item) {
        if (item?.type === "creature_attack") return Number(item.system?.parry_limit) === 50 ? 50 : 100;
        return HALF_OB_TYPES.includes(item?.system?.type) ? 50 : 100;
    }

    /** Stunned actors can parry with 50 % of their OB at most. */
    static isStunned(actor) {
        return !!actor?.effects?.some?.((e) => e.name === "Stunned" && (e.duration?.value ?? 0) > 0);
    }

    /**
     * Cap (percent of OB) that applies right now: the item's own, or 50 % if stunned, whichever
     * is lower - the two restrictions never stack (a stunned two-handed fighter keeps 50 %).
     * @param {Item} item
     * @param {Actor} actor
     * @returns {100|50}
     */
    static getCapPercent(item, actor) {
        return Math.min(ParryService.getItemCapPercent(item), ParryService.isStunned(actor) ? STUNNED_CAP : 100);
    }

    /**
     * Can an attack made with this weapon be parried by a weapon? (Shields are handled apart.)
     * @param {Item} weapon - the attacker's weapon or creature_attack
     * @param {{ isSpell?: boolean }} [options]
     * @returns {boolean}
     */
    static isParryableAttack(weapon, { isSpell = false } = {}) {
        if (isSpell) return false;
        if (!weapon) return false;
        if (weapon.type === "creature_attack") return true;
        return !NO_PARRY_TYPES.includes(weapon.system?.type);
    }

    /**
     * Most OB points that can be reserved: the cap's share of the OB, rounded down.
     * @param {number} ob
     * @param {number} capPercent - 100 or 50
     * @returns {number}
     */
    static getMaxReservable(ob, capPercent) {
        return Math.floor(Math.max(0, Number(ob) || 0) * (Number(capPercent) || 0) / 100);
    }

    /**
     * Clamp the requested OB to what the cap allows; defense is 1:1 with what is spent.
     * @param {number} requested - OB points the player wants to reserve
     * @param {number} ob - OB available to reserve from
     * @param {number} capPercent - 100 or 50
     * @returns {{ spent: number, defense: number, max: number }}
     */
    static computeReservation(requested, ob, capPercent) {
        const max = ParryService.getMaxReservable(ob, capPercent);
        const spent = Math.min(Math.max(0, Math.floor(Number(requested) || 0)), max);
        return { spent, defense: spent, max };
    }

    // --- "Must parry" criticals --------------------------------------------------

    /** Active "Parry" critical effects (not this module's own "Parry +N" stance marker). */
    static getMustParryEffects(actor) {
        return [...(actor?.effects ?? [])].filter((e) => e.name === "Parry" && (e.duration?.value ?? 0) > 0);
    }

    /** Sum of the active "must parry" penalties (zero or negative); each one counts while it lasts. */
    static getMustParryPenalty(actor) {
        return ParryService.getMustParryEffects(actor).reduce((sum, e) => {
            const raw = e.flags?.rmss?.value ?? e.getFlag?.("rmss", "value");
            return sum - Math.abs(Number(raw) || 0);
        }, 0);
    }

    /** Longest remaining duration among the active "must parry" effects, in rounds. */
    static getMustParryRounds(actor) {
        return ParryService.getMustParryEffects(actor).reduce((max, e) => Math.max(max, Number(e.duration?.value) || 0), 0);
    }

    /** Is the actor currently obliged to keep a parry reserved? (No parry cancels the obligation.) */
    static isMustParry(actor) {
        return ParryService.getMustParryEffects(actor).length > 0 && !ParryService.hasNoParryEffect(actor);
    }

    /**
     * Least OB the actor must keep reserved: half of it, but never above what the cap allows.
     * @param {Actor} actor
     * @param {number} ob
     * @param {number} capPercent
     * @returns {number} 0 when there is no obligation
     */
    static getMinReservable(actor, ob, capPercent) {
        if (!ParryService.isMustParry(actor)) return 0;
        const half = Math.floor(Math.max(0, Number(ob) || 0) * MUST_PARRY_MIN_PERCENT / 100);
        return Math.min(half, ParryService.getMaxReservable(ob, capPercent));
    }

    static async _defaultGetOb() {
        // Lazy: the skill manager itself imports this service.
        const { RMSSWeaponSkillManager } = await import("../rmss_weapon_skill_manager.js");
        return (item, actor) => RMSSWeaponSkillManager._getOffensiveBonusFromWeapon(item, actor);
    }

    /**
     * Make sure a "must parry" victim has at least the forced reservation: create it with the
     * weapon that can reserve the most, or raise the current one. Never lowers anything.
     * @param {Actor} actor
     * @param {{ getOb?: (item: Item, actor: Actor) => number, combatId?: string|null }} [options]
     * @returns {Promise<object|null>} the reservation in force, or null when none can be made
     */
    static async enforceMustParry(actor, { getOb = null, combatId = null } = {}) {
        if (!ParryService.isMustParry(actor)) return null;
        const obOf = getOb ?? (await ParryService._defaultGetOb());

        const options = ParryService.getParryCandidates(actor)
            .map((item) => {
                const ob = Math.max(0, Math.floor(Number(obOf(item, actor)) || 0));
                const cap = ParryService.getCapPercent(item, actor);
                return { item, ob, cap, max: ParryService.getMaxReservable(ob, cap) };
            })
            .filter((o) => o.max > 0)
            .sort((a, b) => b.max - a.max);
        if (!options.length) return null;

        const current = ParryService.getReservation(actor);
        const currentOption = current && options.find((o) => (o.item.id ?? o.item._id) === current.weaponId);
        const chosen = currentOption ?? options[0];
        const min = ParryService.getMinReservable(actor, chosen.ob, chosen.cap);
        if (currentOption && Number(current.points) >= min) return current;

        const requested = Math.max(min, currentOption ? Number(current.points) || 0 : 0);
        const result = await ParryService.reserve(actor, { item: chosen.item, requested, ob: chosen.ob, combatId, isGM: true });
        return result.ok ? result.reservation : null;
    }

    // --- State ------------------------------------------------------------------

    /**
     * @param {Actor} actor
     * @returns {object|null} the reservation flag
     */
    static getReservation(actor) {
        const raw = actor?.getFlag?.(FLAG_SCOPE, FLAG_KEY) ?? actor?.flags?.[FLAG_SCOPE]?.[FLAG_KEY] ?? null;
        return raw && typeof raw === "object" && Number(raw.points) > 0 ? raw : null;
    }

    /** A critical "can't parry" (effect "No parry") blocks both reserving and applying. */
    static hasNoParryEffect(actor) {
        return !!actor?.effects?.some?.((e) => e.name === "No parry" && (e.duration?.value ?? 0) > 0);
    }

    /**
     * Items the actor can currently parry with: equipped melee weapons plus creature attacks.
     * @param {Actor} actor
     * @returns {Item[]}
     */
    static getParryCandidates(actor) {
        if (!actor?.items) return [];
        const weapons = EquipmentService.getEquippedWeapons(actor).filter((w) => ParryService.canParryWith(w));
        const attacks = [...actor.items].filter((i) => i.type === "creature_attack");
        return [...weapons, ...attacks];
    }

    /**
     * Can this user reserve parry for the combatant right now? Own turn, or before their first
     * turn (pre-combat); the GM may always.
     * @param {Combat|null} combat
     * @param {Combatant} combatant
     * @param {boolean} isGM
     * @returns {{ allowed: boolean, ownTurn: boolean }}
     */
    static canReserveNow(combat, combatant, isGM) {
        const ownTurn = !!combat?.started && combat.combatant?.id === combatant?.id;
        if (isGM || ownTurn || !combat?.started) return { allowed: true, ownTurn };
        const index = (combat.turns ?? []).findIndex((c) => c.id === combatant?.id);
        const beforeFirstTurn = combat.round <= 1 && index > combat.turn;
        return { allowed: beforeFirstTurn, ownTurn };
    }

    /**
     * Save a reservation on the actor.
     * @param {Actor} actor
     * @param {{ item: Item, requested: number, ob: number, combatId?: string|null, isGM?: boolean }} params
     * @returns {Promise<{ ok: boolean, reason?: string, reservation?: object }>}
     */
    static async reserve(actor, { item, requested, ob, combatId = null, isGM = false }) {
        if (ParryService.hasNoParryEffect(actor)) return { ok: false, reason: "no_parry_effect" };
        if (!ParryService.canParryWith(item)) return { ok: false, reason: "no_weapon" };
        const capPercent = ParryService.getCapPercent(item, actor);
        const { spent, defense } = ParryService.computeReservation(requested, ob, capPercent);
        if (defense <= 0) return { ok: false, reason: "no_ob" };

        // A "must parry" critical sets a floor that only the GM may go under.
        if (!isGM && spent < ParryService.getMinReservable(actor, ob, capPercent)) {
            return { ok: false, reason: "must_parry_min" };
        }

        // An unpaid stance can be raised, never lowered (a GM may fix anything).
        const current = ParryService.getReservation(actor);
        if (current && !current.paid && !isGM && spent < (Number(current.points) || 0)) {
            return { ok: false, reason: "unpaid_lower" };
        }

        const reservation = {
            points: spent,
            capPercent,
            defense,
            requested: Math.max(0, Math.floor(Number(requested) || 0)),
            ob: Math.max(0, Math.floor(Number(ob) || 0)),
            weaponId: item.id ?? item._id ?? null,
            weaponName: item.name ?? "",
            consumed: false,
            paid: false,
            combatId
        };
        // setFlag would deep-merge into the previous reservation: drop it first so a smaller
        // reservation doesn't inherit stale keys.
        await actor.unsetFlag(FLAG_SCOPE, FLAG_KEY);
        await actor.setFlag(FLAG_SCOPE, FLAG_KEY, reservation);
        return { ok: true, reservation };
    }

    /** Whether a player may release/lower this stance yet (see `paid`). */
    static canRelease(actor, isGM = false) {
        const reservation = ParryService.getReservation(actor);
        if (!reservation || isGM) return true;
        if (ParryService.isMustParry(actor)) return false;
        return reservation.paid === true;
    }

    /**
     * Release the stance. A player can't until it has been paid by an attack; the GM always can,
     * and so does the system when a combat ends (`force`).
     * @param {Actor} actor
     * @param {{ isGM?: boolean, force?: boolean }} [options]
     * @returns {Promise<{ ok: boolean, reason?: string }>}
     */
    static async clear(actor, { isGM = false, force = false } = {}) {
        if (!ParryService.getReservation(actor)) return { ok: true };
        if (!force && !ParryService.canRelease(actor, isGM)) {
            return { ok: false, reason: ParryService.isMustParry(actor) ? "must_parry_min" : "unpaid_lower" };
        }
        await actor.unsetFlag(FLAG_SCOPE, FLAG_KEY);
        return { ok: true };
    }

    /** The owner attacked with the stance on: its OB cost has been charged. */
    static async markPaid(actor) {
        const reservation = ParryService.getReservation(actor);
        if (!reservation || reservation.paid) return;
        await actor.setFlag(FLAG_SCOPE, FLAG_KEY, { paid: true });
    }

    /** The reserved defense went into one parried attack: it can't parry a second one. */
    static async consumeDefense(actor) {
        const reservation = ParryService.getReservation(actor);
        if (!reservation || reservation.consumed) return;
        await actor.setFlag(FLAG_SCOPE, FLAG_KEY, { consumed: true });
    }

    /**
     * Called when the actor's own turn starts: the stance carries on, with its defense available
     * again. The caps are re-applied first (stunned now, or recovered), and the stance is dropped if
     * the weapon it was made with is no longer in hand.
     * @param {Actor} actor
     * @returns {Promise<"none"|"kept"|"dropped">}
     */
    static async refreshAtTurnStart(actor) {
        const reservation = ParryService.getReservation(actor);
        if (!reservation) return "none";

        const item = [...(actor.items ?? [])].find((i) => (i.id ?? i._id) === reservation.weaponId);
        const stillUsable = item && ParryService.canParryWith(item)
            && (item.type === "creature_attack" || item.system?.equipped === true);
        if (!stillUsable) {
            await actor.unsetFlag(FLAG_SCOPE, FLAG_KEY);
            return "dropped";
        }

        const capPercent = ParryService.getCapPercent(item, actor);
        const { spent, defense } = ParryService.computeReservation(
            reservation.requested ?? reservation.points, reservation.ob ?? reservation.points, capPercent
        );
        if (defense <= 0) {
            await actor.unsetFlag(FLAG_SCOPE, FLAG_KEY);
            return "dropped";
        }
        await actor.setFlag(FLAG_SCOPE, FLAG_KEY, { points: spent, defense, capPercent, consumed: false });
        return "kept";
    }

    // --- Attack confirmation ----------------------------------------------------

    /**
     * OB the attacker keeps set aside for parrying: it is deducted from their attacks every round
     * (floored at 0, so an attacker who parried with everything still attacks at 0) while the
     * stance lasts. Spells don't draw from weapon OB, so callers skip this for them.
     * @param {Actor} attacker
     * @param {number} ob - the attack's OB before penalties
     * @returns {{ value: number, points: number }|null} value is negative
     */
    static getAttackerDeduction(attacker, ob) {
        const reservation = ParryService.getReservation(attacker);
        // A "No parry" critical suspends the stance entirely: no parry, and the OB comes back.
        if (!reservation || ParryService.hasNoParryEffect(attacker)) return null;
        const value = Math.min(Number(reservation.points) || 0, Math.max(0, Number(ob) || 0));
        if (value <= 0) return null;
        return { value: -value, points: Number(reservation.points) || 0 };
    }

    /**
     * Whether the defender's reserved parry applies to this attack, and why not otherwise.
     * @param {{ defender: Actor|null, attackWeapon: Item|null, isSpell?: boolean, facingValue?: string|null }} params
     * @returns {{ applies: boolean, defense: number, points: number, reason: string|null }}
     */
    static evaluateDefender({ defender, attackWeapon, isSpell = false, facingValue = FacingService.FACING.FRONT }) {
        const reservation = ParryService.getReservation(defender);
        const base = { applies: false, defense: 0, points: 0, reason: null };
        if (!reservation) return { ...base, reason: PARRY_REASON.NONE };
        const info = { ...base, defense: Number(reservation.defense) || 0, points: Number(reservation.points) || 0 };
        if (reservation.consumed) return { ...info, defense: 0, reason: PARRY_REASON.CONSUMED };
        if (ParryService.hasNoParryEffect(defender)) return { ...info, defense: 0, reason: PARRY_REASON.NO_PARRY };
        if (isSpell) return { ...info, defense: 0, reason: PARRY_REASON.SPELL };
        if (!ParryService.isParryableAttack(attackWeapon)) return { ...info, defense: 0, reason: PARRY_REASON.NOT_PARRYABLE };
        if ((facingValue ?? FacingService.FACING.FRONT) !== FacingService.FACING.FRONT) return { ...info, defense: 0, reason: PARRY_REASON.NOT_FRONT };
        return { ...info, applies: true, reason: null };
    }
}
