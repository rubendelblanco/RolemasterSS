import { socket } from "../../rmss.js";
import RMSSTableManager from "./rmss_table_manager.js";
import CombatExperience from "../sheets/experience/rmss_combat_experience.js";
import Utils from "../utils.js";
import { rmss } from "../config.js";
import { RMSSCombat } from "./rmss_combat.js";
import { RMSSEffectApplier } from "./rmss_effect_applier.js";
import WeaponFumbleService from "./services/weapon_fumble_service.js";
import { CombatHistoryTracker } from "./combat_history_tracker.js";
import EquipmentService from "../actors/services/equipment_service.js";
import { shiftSeverity, effectWeaponShiftMilderProcedureI } from "./weapon_effects_service.js";
import { withPublicRollMode } from "../chat/chatMessages.js";
import { getWeaponSlayingArray } from "../sheets/items/weapon_slaying_ui.js";
import { getCreatureTagsArray } from "../sheets/actors/creature_tags_ui.js";


/* ---------------------------------------------
 * Mapping of column results for large creature criticals
 * --------------------------------------------- */
/** Spell critical types (use large_spell / superlarge_spell for large creatures). */
const SPELL_CRIT_TYPES = new Set(["heat", "cold", "electricity", "impact", "strikes", "large_spell", "superlarge_spell"]);
/** Melee critical types (use large_melee / superlarge_melee for large creatures). */
const MELEE_CRIT_TYPES = new Set(["S", "K", "P", "U", "G", "T", "slash", "krush", "puncture", "unbalance", "grappling", "tiny", "brawl", "subdue", "sweeps", "large_melee", "superlarge_melee"]);

/** @param {string} ct */
function isLargeCreatureCriticalTableType(ct) {
    return Boolean(ct && rmss.large_critical_types && Object.prototype.hasOwnProperty.call(rmss.large_critical_types, ct));
}

const CRITICAL_COLUMN_MAP = {
    large_spell: { normal: "A", default: "B" },
    superlarge_spell: { normal: "A", default: "B" },
    large_melee: {
        normal: "A",
        magic: "B",
        mithril: "C",
        holy: "D",
        slaying: "E"
    },
    superlarge_melee: {
        normal: "A",
        magic: "B",
        mithril: "C",
        holy: "D",
        slaying: "E"
    }
};

class LargeCreatureCriticalStrategy {
    constructor(criticalType) {
        this.criticalType = criticalType;
    }

    /**
     * Determine which critical table column applies to this subtype.
     * @param {string} subtype - The weapon or material subtype (normal, magic, mithril, etc.)
     * @returns {string} - The letter of the column (A–E).
     */
    getColumForCriticalSubtype(subtype) {
        const map = CRITICAL_COLUMN_MAP[this.criticalType];
        if (!map) throw new Error(`Unknown critical type: ${this.criticalType}`);
        return map[subtype] ?? map.default ?? "A";
    }

    async apply(attackerActor, defenderActor, data = {}) {
        const {
            damage,
            severity,
            critType,
            subCritType,
            modifier = 0,
            metadata = {},
        } = data;
        const tableName = this.criticalType;

        // Apply XP for player characters (message sent after critical so order is natural)
        let expBreakDown = null;
        let totalExp = 0;
        if (Utils.isAPC(attackerActor.id)) {
            const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(defenderActor, data.severity));
            const hpExp = parseInt(data.damage);
            expBreakDown = isNaN(criticalExp)
                ? { hp: hpExp }
                : { critical: criticalExp, hp: hpExp };
            totalExp = Object.values(expBreakDown).reduce((a, b) => a + b, 0);
            const totalExpActor = parseInt(attackerActor.system.attributes.experience_points.value || 0) + totalExp;
            await attackerActor.update({ "system.attributes.experience_points.value": totalExpActor });
        }

        // Roll for the critical
        const column = this.getColumForCriticalSubtype(subCritType);
        const roll = new Roll(`1d100x>95`);
        await roll.evaluate();

        const priorHits = defenderActor.system.attributes.hits.current;
        let newHits = priorHits - parseInt(damage);
        await defenderActor.update({ "system.attributes.hits.current": newHits });

        const tracker = CombatHistoryTracker.get();
        tracker.recordDamage(attackerActor.id, defenderActor.id, parseInt(damage), newHits <= 0);
        await RMSSEffectApplier.applyDeathIfBroughtToZero(defenderActor, priorHits, newHits, attackerActor.id);
        tracker.recordCritical(attackerActor.id, defenderActor.id, data.severity);

        if (severity === "null") return;

        const naturalTotal = parseInt(roll.total, 10);
        let result = Math.min(Math.max(naturalTotal + parseInt(modifier, 10), 1), 999);
        const expData = (expBreakDown && totalExp > 0)
            ? { actorName: attackerActor.name, actorId: attackerActor.id, expBreakdown: expBreakDown, expGained: totalExp }
            : null;
        const tableResult = await RMSSTableManager.getCriticalTableResult(result, defenderActor, column, tableName, roll, expData);
        if (tableResult && typeof tableResult === "object") {
            tableResult._rmssContext = {
                severity: data.severity,
                mainSeverity: data.mainSeverity ?? data.severity,
                attackerId: attackerActor.id
            };
        }

        const ew = data.effectWeapon;
        if (tableResult && ew?.enabled) {
            const weapons = EquipmentService.getEquippedWeapons(attackerActor);
            const tier = weapons[0]?.system?.weapon_effects?.effect_weapon;
            let secondColumn = column;
            let largeEwRollMod = 0;
            if (!ew.duplicatePrimary) {
                if (tier === "minor") {
                    const r = effectWeaponShiftMilderProcedureI(column, 2);
                    secondColumn = r.secondSeverity;
                    largeEwRollMod = r.ewRollModifier;
                } else if (tier === "normal") {
                    const r = effectWeaponShiftMilderProcedureI(column, 1);
                    secondColumn = r.secondSeverity;
                    largeEwRollMod = r.ewRollModifier;
                } else if (tier === "superior") {
                    secondColumn = shiftSeverity(column, 1);
                }
            }
            const extraRaw = ew.extraCritType;
            const extraType = (extraRaw && String(extraRaw).trim() !== "") ? String(extraRaw).trim() : tableName;

            const clampOpen = (n) => Math.min(Math.max(n, 1), 999);
            const ewM = Number(ew.ewRollModifier) || 0;
            /**
             * Second lookup: Effect Weapon roll penalties (−50 Minor on A, −25 Minor on B→A, etc.) apply only to the extra table,
             * on the natural open-ended total — not stacked on top of the main index (which already includes modifier).
             */
            const resultExtraForLargeTable =
                largeEwRollMod !== 0 ? clampOpen(naturalTotal + largeEwRollMod) : result;
            const resultExtraForStandardTable =
                ewM !== 0 ? clampOpen(naturalTotal + ewM) : result;

            let secondResult;
            if (ew.duplicatePrimary) {
                if (extraType !== tableName) {
                    if (isLargeCreatureCriticalTableType(extraType)) {
                        secondResult = await RMSSTableManager.getCriticalTableResult(
                            result,
                            defenderActor,
                            column,
                            extraType,
                            roll,
                            null,
                            { isEffectWeaponExtra: true }
                        );
                    } else {
                        secondResult = await RMSSTableManager.getCriticalTableResult(
                            result,
                            defenderActor,
                            data.severity,
                            extraType,
                            roll,
                            null,
                            { isEffectWeaponExtra: true }
                        );
                    }
                } else {
                    secondResult = foundry.utils.duplicate(tableResult);
                    delete secondResult._rmssEffectWeaponFollowUp;
                    await RMSSTableManager.announceCriticalInChat(secondResult, roll, null, {
                        isEffectWeaponExtra: true,
                        displayRollTotal: result
                    });
                }
            } else if (ew.superiorEChain) {
                secondResult = await RMSSTableManager.getCriticalTableResult(
                    result,
                    defenderActor,
                    "E",
                    extraType,
                    roll,
                    null,
                    { isEffectWeaponExtra: true }
                );
                const thirdResult = await RMSSTableManager.getCriticalTableResult(
                    result,
                    defenderActor,
                    "A",
                    extraType,
                    roll,
                    null,
                    { isEffectWeaponExtra: true }
                );
                if (secondResult && thirdResult) {
                    secondResult._rmssContext = { ...tableResult._rmssContext };
                    thirdResult._rmssContext = { ...tableResult._rmssContext };
                    delete secondResult._rmssEffectWeaponFollowUp;
                    secondResult._rmssEffectWeaponFollowUp = thirdResult;
                }
            } else if (isLargeCreatureCriticalTableType(extraType)) {
                secondResult = await RMSSTableManager.getCriticalTableResult(
                    resultExtraForLargeTable,
                    defenderActor,
                    secondColumn,
                    extraType,
                    roll,
                    null,
                    { isEffectWeaponExtra: true }
                );
            } else {
                const sev = ew.secondSeverity ?? data.severity;
                secondResult = await RMSSTableManager.getCriticalTableResult(
                    resultExtraForStandardTable,
                    defenderActor,
                    sev,
                    extraType,
                    roll,
                    null,
                    { isEffectWeaponExtra: true }
                );
            }
            if (secondResult) {
                secondResult._rmssContext = { ...tableResult._rmssContext };
                tableResult._rmssEffectWeaponFollowUp = secondResult;
            }
        }

        return tableResult;
    }
}

class BaseCriticalStrategy {
    constructor(criticalType) {
        this.criticalType = criticalType;
    }

    async apply(attackerActor, defenderActor, data = {}) {
        let expBreakDown = null;
        let totalExp = 0;
        if (Utils.isAPC(attackerActor.id)) {
            const criticalExp = parseInt(CombatExperience.calculateCriticalExperience(defenderActor, data.severity));
            const hpExp = parseInt(data.damage);

            if (criticalExp === "null" || isNaN(criticalExp)) {
                expBreakDown = { hp: hpExp };
                totalExp = hpExp;
            } else {
                expBreakDown = { critical: criticalExp, hp: hpExp };
                totalExp = criticalExp + hpExp;
            }

            let totalExpActor = parseInt(attackerActor.system.attributes.experience_points.value || 0);
            totalExpActor = totalExpActor + totalExp;
            await attackerActor.update({ "system.attributes.experience_points.value": totalExpActor });
        }

        const targetId = data.targetTokenId ?? RMSSCombat.getTargets()?.[0]?.id;
        if (!targetId) {
            ui.notifications.error("No target token found.");
            return;
        }
        data.attackerId = attackerActor.id;
        data.defenderId = defenderActor.id;
        data.expBreakDown = expBreakDown;
        data.totalExp = totalExp;
        return await socket.executeAsGM("updateActorHits", targetId, true, parseInt(data.damage), data);
    }
}

export class RMSSWeaponCriticalManager {
    static criticalCalculatorStrategy(criticalType) {
        switch (criticalType) {
            case "large_melee":
            case "superlarge_melee":
            case "large_spell":
            case "superlarge_spell":
                return new LargeCreatureCriticalStrategy(criticalType);
            default:
                return new BaseCriticalStrategy(criticalType);
        }
    }

    static decomposeCriticalResult(result, criticalSeverity = null, weaponCriticalType = null) {
        // e.g result is "10A", "20B", "30C", "-", "F" or 50
        if (result == null || result === "") {
            return { damage: null, criticals: [] };
        }
        if (result === "-") { //nothing
            return { criticals: [] };
        }
        if (result === "F") { //fumble
            // TODO
            return { criticals: 'fumble' };// Also nothing
        }

        if (typeof result === "number" || /^\d+$/.test(result)) {
            //only HP
            return { 'damage': parseInt(result, 10), 'criticals': [] };
        }

        // critical "tipo" 36CK -> 36 HP, C severity, Krush critical type
        const regex = /^(\d+)?([A-Z])?([A-Z])?$/;
        const match = result.match(regex);

        if (match) {
            const damage = match[1] || null; // e.g. "10"
            const severity = match[2] || null; // A, B, C...
            let critType = match[3] || null; // S=slash, K=krush
            if (!!severity && severity >= "F" && !!criticalSeverity) {
                let criticalsRaw = criticalSeverity[severity];
                const criticals = Array.from(Object.entries(criticalsRaw)).map(([key, value], idx) => {
                    return { 'severity': value, 'critType': key, damage: idx === 0 ? damage : 0 };
                });

                return { damage, criticals };
            } else if (critType == null && !!criticalSeverity) {
                return { damage, criticals: [{ 'severity': severity, 'critType': criticalSeverity.default, damage }] };
            }
            if (critType == null && weaponCriticalType) critType = weaponCriticalType;
            return { 'damage': damage, 'criticals': [{ 'severity': severity, 'critType': critType, damage }] };
        }
        else {
            ui.notifications.error("Invalid critical format");
            return { criticals: [] };
        }
    }

    /**
     * When socket payload omits effectWeapon.ewRollModifier, recompute Minor/Normal shift from equipped weapon + main severity (RM 9.7).
     * @returns {{ secondSeverity: string, ewRollModifier: number }|null}
     */
    static _effectWeaponShiftFromEquippedWeapon(attackerId, mainSeverity) {
        if (!attackerId) return null;
        const attacker = game.actors.get(attackerId);
        if (!attacker?.items) return null;
        const weapons = EquipmentService.getEquippedWeapons(attacker);
        const tier = weapons[0]?.system?.weapon_effects?.effect_weapon;
        if (!tier || tier === "none" || tier === "") return null;
        const s = String(mainSeverity ?? "").trim();
        if (!s || s === "null") return null;
        const sev = s.toUpperCase()[0];
        if (tier === "minor") return effectWeaponShiftMilderProcedureI(sev, 2);
        if (tier === "normal") return effectWeaponShiftMilderProcedureI(sev, 1);
        return null;
    }

    static async updateTokenOrActorHits(token, damage, attackerId = null) {
        const actor = Utils.getActor(token);
        if (!actor) return;
        const dmg = parseInt(damage);
        const priorHits = actor.system.attributes.hits.current;
        let newHits = priorHits - dmg;
        await actor.update({ "system.attributes.hits.current": newHits });

        if (attackerId && game.combat?.id) {
            const tracker = CombatHistoryTracker.get();
            tracker.recordDamage(attackerId, actor.id, dmg, newHits <= 0);
        }
        await RMSSEffectApplier.applyDeathIfBroughtToZero(actor, priorHits, newHits, attackerId);
    }

    static async updateActorHits(targetId, isToken, damage, gmResponse) {
        const token = canvas.scene.tokens.get(targetId);
        if (!token) return;
        if (isNaN(damage)) return;
        const target = token.actor;
        const dmg = parseInt(damage);
        const priorHits = target.system.attributes.hits.current;
        let newHits = priorHits - dmg;
        await target.update({ "system.attributes.hits.current": newHits });

        const attackerId = gmResponse?.attackerId;
        if (attackerId && game.combat?.id) {
            const tracker = CombatHistoryTracker.get();
            tracker.recordDamage(attackerId, target.id, dmg, newHits <= 0);
            tracker.recordCritical(attackerId, target.id, gmResponse?.severity);
        }
        await RMSSEffectApplier.applyDeathIfBroughtToZero(target, priorHits, newHits, attackerId, token);

        if (gmResponse.severity === "null") return;
        const roll = new Roll(`(1d100)`);
        await roll.evaluate();
        const natural = parseInt(roll.total, 10);
        const dialogMod = parseInt(gmResponse.modifier ?? 0, 10);
        const baseRoll = natural + dialogMod;
        let result = Math.min(Math.max(baseRoll, 1), 100);
        /** Effect Weapon Minor/Normal: −50/−25 etc. apply only to the *second* table, on the natural d100 — not added to the main critical index. */
        const ew0 = gmResponse.effectWeapon;
        let ewMod = Number(ew0?.ewRollModifier);
        if (!Number.isFinite(ewMod)) ewMod = 0;
        let resolvedSecondSeverity = ew0?.secondSeverity;
        // Socket payloads sometimes drop ewRollModifier / secondSeverity; recompute from equipped weapon on GM client.
        if (ew0?.enabled === true && !ew0.duplicatePrimary && !ew0.superiorEChain) {
            const shift = RMSSWeaponCriticalManager._effectWeaponShiftFromEquippedWeapon(
                gmResponse.attackerId,
                gmResponse.severity
            );
            if (shift) {
                if (ewMod === 0) ewMod = shift.ewRollModifier;
                if (!resolvedSecondSeverity) resolvedSecondSeverity = shift.secondSeverity;
            }
        }
        const resultExtra =
            ewMod !== 0
                ? Math.min(Math.max(natural + ewMod, 1), 100)
                : result;
        let expData = null;
        if (gmResponse.expBreakDown && gmResponse.totalExp > 0 && gmResponse.attackerId) {
            const attacker = game.actors.get(gmResponse.attackerId);
            if (attacker) {
                expData = {
                    actorName: attacker.name,
                    actorId: attacker.id,
                    expBreakdown: gmResponse.expBreakDown,
                    expGained: gmResponse.totalExp
                };
            }
        }
        const tableResult = await RMSSTableManager.getCriticalTableResult(
            result,
            target,
            gmResponse.severity,
            gmResponse.critType,
            roll,
            expData
        );
        if (tableResult && typeof tableResult === "object") {
            tableResult._rmssContext = {
                severity: gmResponse.severity,
                mainSeverity: gmResponse.mainSeverity ?? gmResponse.severity,
                attackerId: gmResponse.attackerId
            };
        }

        const ew = gmResponse.effectWeapon;
        if (tableResult && ew?.enabled) {
            let secondResult;
            const mainCrit = String(gmResponse.critType ?? "").trim();
            const extraCrit = (ew.extraCritType && String(ew.extraCritType).trim() !== "")
                ? String(ew.extraCritType).trim()
                : mainCrit;
            if (ew.duplicatePrimary) {
                // Greater: same severity / same roll. If the extra table differs, re-query; do not clone primary text.
                if (extraCrit !== mainCrit) {
                    secondResult = await RMSSTableManager.getCriticalTableResult(
                        resultExtra,
                        target,
                        gmResponse.severity,
                        extraCrit,
                        roll,
                        null,
                        { isEffectWeaponExtra: true }
                    );
                } else {
                    secondResult = foundry.utils.duplicate(tableResult);
                    delete secondResult._rmssEffectWeaponFollowUp;
                    await RMSSTableManager.announceCriticalInChat(secondResult, roll, null, {
                        isEffectWeaponExtra: true,
                        displayRollTotal: result
                    });
                }
            } else if (ew.superiorEChain) {
                // Superior + E severity: E on primary; on extra table E then A; same d100 roll (Superior adds no extra roll mod).
                const critExtra = extraCrit;
                secondResult = await RMSSTableManager.getCriticalTableResult(
                    result,
                    target,
                    "E",
                    critExtra,
                    roll,
                    null,
                    { isEffectWeaponExtra: true }
                );
                const thirdResult = await RMSSTableManager.getCriticalTableResult(
                    result,
                    target,
                    "A",
                    critExtra,
                    roll,
                    null,
                    { isEffectWeaponExtra: true }
                );
                if (secondResult && thirdResult) {
                    secondResult._rmssContext = { ...tableResult._rmssContext };
                    thirdResult._rmssContext = { ...tableResult._rmssContext };
                    delete secondResult._rmssEffectWeaponFollowUp;
                    secondResult._rmssEffectWeaponFollowUp = thirdResult;
                }
            } else {
                const critType2 = extraCrit;
                const col = resolvedSecondSeverity ?? ew.secondSeverity;
                secondResult = await RMSSTableManager.getCriticalTableResult(
                    resultExtra,
                    target,
                    col,
                    critType2,
                    roll,
                    null,
                    { isEffectWeaponExtra: true }
                );
            }
            if (secondResult) {
                secondResult._rmssContext = { ...tableResult._rmssContext };
                tableResult._rmssEffectWeaponFollowUp = secondResult;
            }
        }

        return tableResult;
    }

    /**
     * Apply large/superlarge critical on the GM client so defender hits (incl. unlinked token ActorDelta)
     * and combat tracker updates succeed; players lack permission to update NPC token actors.
     * @param {{ attackerId: string, targetTokenId: string, critType: string, applyPayload: object }} payload
     */
    static async applyLargeCreatureCriticalGM(payload) {
        const { attackerId, targetTokenId, critType, applyPayload } = payload ?? {};
        const attacker = Utils.getActor(attackerId);
        const token = canvas?.scene?.tokens?.get(targetTokenId);
        if (!attacker || !token?.actor) {
            ui.notifications.error(
                "Could not apply large creature critical (attacker or token not found on GM canvas)."
            );
            return undefined;
        }
        const strategy = RMSSWeaponCriticalManager.criticalCalculatorStrategy(critType);
        return await strategy.apply(attacker, token.actor, applyPayload);
    }

    /**
     * Returns the default critical subtype for large/superlarge melee based on the attacker's equipped weapon.
     * Priority: Holy > Mithril > Magical > Normal. Slaying is not auto-selected (creature-dependent).
     * @param {string|null} attackerId - Actor ID (or token document id)
     * @param {string} critType - e.g. large_melee, superlarge_melee
     * @returns {string} - One of: normal, magic, mithril, holy
     */
    /**
     * Filter criticals for large/superlarge creatures: A is ignored (large), A-B ignored (superlarge).
     * For remaining criticals, set critType to large_melee or superlarge_melee.
     * @param {Object} criticalResult - { damage, criticals }
     * @param {Actor} enemy - Target actor
     * @returns {Object} - Filtered criticalResult; criticals may be empty
     */
    static filterCriticalResultForLargeCreatures(criticalResult, enemy) {
        const ct = enemy?.system?.attributes?.critical_codes?.critical_table;
        if (!ct || !["la", "sl"].includes(ct)) return criticalResult;
        const critType = ct === "la" ? "large_melee" : "superlarge_melee";
        const ignoreSeverities = ct === "la" ? ["A"] : ["A", "B"];
        const filtered = (criticalResult.criticals || []).filter(
            (c) => !c.severity || !ignoreSeverities.includes(c.severity)
        );
        filtered.forEach((c) => { c.critType = critType; });
        return { ...criticalResult, criticals: filtered };
    }

    /**
     * The attacker's weapon (or the one identified by weaponItemId, falling back to the
     * first equipped weapon) for a large-creature critical decision.
     */
    static _resolveCriticalWeapon(attackerId, weaponItemId = null) {
        const actor = Utils.getActor(attackerId);
        if (!actor?.items) return null;
        const weapons = EquipmentService.getEquippedWeapons(actor);
        return (weaponItemId && weapons.find((w) => (w.id ?? w._id) === weaponItemId)) || weapons[0] || null;
    }

    /**
     * True when the attacker's weapon is flagged as a Slayer (system.isSlaying) AND has a
     * tag matching one of the target's creature tags (e.g. a "dragon slayer" weapon vs. a
     * creature tagged "dragon"). Independent of the target's own critical-table setting —
     * Slaying always applies against a matching creature, regardless of whether it's flagged
     * Large/Superlarge. isSlaying is a separate toggle from the tags themselves: a weapon can
     * have tags (and even a slaying_bonus, see RMSSWeaponSkillManager) purely for the OB bonus
     * without forcing the Slaying critical column — that's what isSlaying gates.
     */
    static weaponSlaysEnemy(attackerId, enemy, weaponItemId = null) {
        if (!enemy?.system) return false;
        const weapon = RMSSWeaponCriticalManager._resolveCriticalWeapon(attackerId, weaponItemId);
        if (!weapon?.system?.isSlaying) return false;
        const weaponSlaying = getWeaponSlayingArray(weapon.system).map((t) => t.toLowerCase());
        if (weaponSlaying.length === 0) return false;
        const creatureTags = getCreatureTagsArray(enemy.system).map((t) => t.toLowerCase());
        return weaponSlaying.some((t) => creatureTags.includes(t));
    }

    static getDefaultCriticalSubtype(attackerId, critType, enemy, weaponItemId = null) {
        const subtypes = rmss.large_critical_types[critType];
        if (!subtypes || subtypes.length === 0) return "normal";
        // Slaying takes priority over holy/mithril/magic.
        if (subtypes.includes("slaying") && RMSSWeaponCriticalManager.weaponSlaysEnemy(attackerId, enemy, weaponItemId)) {
            return "slaying";
        }
        const weapon = RMSSWeaponCriticalManager._resolveCriticalWeapon(attackerId, weaponItemId);
        if (!weapon?.system) return "normal";
        // Holy and unholy weapons both hit as sacred (same combat effect)
        if (weapon.system.holy === true || weapon.system.unholy === true) return subtypes.includes("holy") ? "holy" : "normal";
        if (weapon.system.material === "mithril_alloy") return subtypes.includes("mithril") ? "mithril" : "normal";
        if (weapon.system.magical === true) return subtypes.includes("magic") ? "magic" : "normal";
        return "normal";
    }

    /**
     * @param {object} [options]
     * @param {string} [options.attackerUuid] - Actor UUID from the attack (resolves the same document as the embedded weapon item).
     * @param {string} [options.mainSeverity] - Primary attack critical severity (for Weapon of Bleeding bonus).
     * @param {{ enabled: boolean, duplicatePrimary?: boolean, secondSeverity?: string, extraCritType?: string, ewRollModifier?: number, superiorEChain?: boolean }} [options.effectWeapon]
     */
    static async sendCriticalMessage(target, initialDamage, initialSeverity, initialCritType, attackerId, options = {}) {
        const gmResponse = await socket.executeAsGM(
            "confirmWeaponCritical",
            target.actor,
            initialDamage,
            initialSeverity,
            initialCritType,
            attackerId,
            options.weaponItemId ?? null,
            options.attackerUuid ?? null
        );

        if (!gmResponse?.confirmed) {
            return undefined;
        }

        if (options.weaponItemId && !gmResponse.weaponItemId) {
            gmResponse.weaponItemId = options.weaponItemId;
        }
        if (!gmResponse.attackerId) {
            gmResponse.attackerId = attackerId;
        }
        if (options.attackerUuid && !gmResponse.attackerUuid) {
            gmResponse.attackerUuid = options.attackerUuid;
        }

        if (options.mainSeverity != null) {
            gmResponse.mainSeverity = options.mainSeverity;
        }
        if (options.effectWeapon?.enabled) {
            gmResponse.effectWeapon = { ...options.effectWeapon };
        }

        const actor = Utils.getActor(attackerId);
        if (!actor) {
            ui.notifications.error("Attacker actor not found.");
            return;
        }

        const {
            damage,
            severity,
            critType,
            subCritType,
            modifier,
            metadata = {},
        } = gmResponse;

        let strategy = RMSSWeaponCriticalManager.criticalCalculatorStrategy(critType);
        const targetTokenId = target?.id ?? target?.document?.id;

        const applyPayload = {
            damage,
            severity,
            critType,
            subCritType,
            modifier,
            metadata,
            targetTokenId,
        };
        if (gmResponse.weaponItemId) {
            applyPayload.weaponItemId = gmResponse.weaponItemId;
        }
        if (gmResponse.mainSeverity != null && gmResponse.mainSeverity !== "") {
            applyPayload.mainSeverity = gmResponse.mainSeverity;
        }
        if (gmResponse.effectWeapon?.enabled) {
            applyPayload.effectWeapon = { ...gmResponse.effectWeapon };
        }

        const largeCreatureCritTypes = ["large_melee", "superlarge_melee", "large_spell", "superlarge_spell"];
        if (largeCreatureCritTypes.includes(critType)) {
            const applied = await socket.executeAsGM("applyLargeCreatureCritical", {
                attackerId: actor.id,
                targetTokenId,
                critType,
                applyPayload,
            });
            await RMSSWeaponCriticalManager._invokeCreatureAttackChainReminderGm(gmResponse, attackerId, options.weaponItemId);
            return applied;
        }

        const applied = await strategy.apply(actor, target.actor, applyPayload);
        await RMSSWeaponCriticalManager._invokeCreatureAttackChainReminderGm(gmResponse, attackerId, options.weaponItemId);
        return applied;
    }

    /**
     * Runs on GM via socket so the chain reminder always fires after the critical is resolved (reliable vs chat pipeline).
     */
    static async _invokeCreatureAttackChainReminderGm(gmResponse, attackerIdFallback, weaponItemIdFallback) {
        const attackerId = gmResponse?.attackerId ?? attackerIdFallback;
        const weaponItemId = gmResponse?.weaponItemId ?? weaponItemIdFallback;
        if (!attackerId || !weaponItemId) return;
        await socket.executeAsGM("postCreatureAttackChainReminderGm", {
            attackerId,
            weaponItemId,
            attackerUuid: gmResponse?.attackerUuid ?? null,
            severity: gmResponse.severity,
            critType: gmResponse.critType
        });
    }

    static async criticalMessagePopup(enemy, damage, severity, critType, attackerId = null, weaponItemId = null, attackerUuid = null) {
        let modifier = 0;
        const isMeleeCrit = MELEE_CRIT_TYPES.has(critType);
        // A matching Slaying weapon always resolves on the Superlarge critical table,
        // regardless of the target's own Critical Table setting (RMSS: Slaying overrides
        // the normal/large/superlarge choice whenever the weapon's tag matches the target).
        const slayingMatch = isMeleeCrit && RMSSWeaponCriticalManager.weaponSlaysEnemy(attackerId, enemy, weaponItemId);
        // Weapons with a fixed damage multiplier (e.g. "does double concussion hit damage")
        // pre-select the multiplier below instead of always defaulting to x1 — melee only,
        // a spell critical has no physical weapon behind it.
        const criticalWeapon = isMeleeCrit ? RMSSWeaponCriticalManager._resolveCriticalWeapon(attackerId, weaponItemId) : null;
        const damageMultiplier = Math.max(1, Math.min(10, Number(criticalWeapon?.system?.weapon_effects?.damage_multiplier) || 1));
        const initialDamage = (Number(damage) || 0) * damageMultiplier;
        if ((enemy.type === "creature" || enemy.type === "npc") && severity != null && severity !== "null") {
            if (enemy.system.attributes.critical_codes.critical_procedure === "I") {
                const S = ["A","B","C","D","E"];
                if (severity === "A") modifier -= 25;
                else severity = S[Math.max(0, S.indexOf(severity) - 1)];
            }
            else if (enemy.system.attributes.critical_codes.critical_procedure === "II") {
                const S = ["A","B","C","D","E"];
                if (severity === "A") modifier -= 50;
                else if (severity === "B") modifier -= 25;
                else severity = S[Math.max(0, S.indexOf(severity) - 1)];
            }

            // Default critical table from defender: la → large, sl → superlarge.
            // A Slaying match forces superlarge even if the defender is set to normal/large.
            const criticalTable = slayingMatch ? "sl" : (enemy.system.attributes.critical_codes?.critical_table ?? "-");
            if (criticalTable === "la" || criticalTable === "sl") {
                const isSpell = SPELL_CRIT_TYPES.has(critType);
                const isMelee = MELEE_CRIT_TYPES.has(critType);
                if (isSpell) {
                    critType = criticalTable === "la" ? "large_spell" : "superlarge_spell";
                } else if (isMelee) {
                    critType = criticalTable === "la" ? "large_melee" : "superlarge_melee";
                }
            }
        }
        const severityForModifier = severity;

        const largeSubtypes = rmss.large_critical_types[critType] || [];
        const subcritdict = largeSubtypes.length > 0
            ? Object.fromEntries(largeSubtypes.map(s => [s, s]))
            : (CONFIG.rmss.criticalSubtypes ?? {});
        const subCritType = largeSubtypes.length > 0 && largeSubtypes.includes("normal") ? "normal" : (Object.keys(subcritdict)[0] ?? "");
        const criticalHasSubtypes = largeSubtypes.length > 0;
        const defaultSubtype = criticalHasSubtypes ? RMSSWeaponCriticalManager.getDefaultCriticalSubtype(attackerId, critType, enemy, weaponItemId) : "normal";
        const enemyCriticalTable = enemy?.system?.attributes?.critical_codes?.critical_table;
        const useLargeCreatureSeverityLabels = ["la", "sl"].includes(enemyCriticalTable) || slayingMatch;
        const initialContext = {
            enemy: enemy,
            damage: damage,
            damageMultiplier,
            initialDamage,
            severity: useLargeCreatureSeverityLabels ? defaultSubtype : severity,
            originalSeverity: severityForModifier,
            critType: critType,
            subCritType,
            critTables: await game.rmss?.attackTableIndex || [],
            subcritdict,
            critDict: CONFIG.rmss.criticalDictionary,
            modifier: modifier,
            criticalHasSubtypes,
            defaultSubtype,
            useLargeCreatureSeverityLabels,
        };
        const htmlContent = await renderTemplate("systems/rmss/templates/combat/confirm-critical.hbs", initialContext);

        const confirmed = await new Promise((resolve) => {
            let settled = false;
            const resolveOnce = (value) => {
                if (settled) return;
                settled = true;
                resolve(value);
            };
            new Dialog(
                {
                    title: game.i18n.localize("rmss.combat.confirm_critical"),
                    content: htmlContent,
                    buttons: {
                        confirm: {
                            label: `✅ ${game.i18n.localize("rmss.combat.confirm")}`,
                            callback: (html) => {
                                const damage = parseInt(html.find("#damage").val());
                                let severity = html.find("#severity").val();
                                const critType = html.find("#critical-type").val();
                                let subCritType = html.find("#critical-subtype").val();
                                const modifier = html.find("#modifier").val();
                                if (initialContext.useLargeCreatureSeverityLabels) {
                                    subCritType = severity;
                                    severity = initialContext.originalSeverity ?? "null";
                                }
                                resolveOnce({
                                    confirmed: true,
                                    damage,
                                    severity,
                                    critType,
                                    subCritType,
                                    modifier,
                                    attackerId,
                                    weaponItemId: weaponItemId ?? null,
                                    attackerUuid: attackerUuid ?? null
                                });
                            }
                        },
                        cancel: {
                            label: `❌ ${game.i18n.localize("rmss.combat.cancel")}`,
                            callback: () => {
                                ui.notifications.error("Attack cancelled!");
                                resolveOnce({ confirmed: false });
                            }
                        }
                    },
                    default: "cancel",
                    // Must live in Dialog data (first arg), not Application options — otherwise X/ESC never resolves the Promise.
                    close: () => resolveOnce({ confirmed: false }),
                    render: (html) => {
                        html.find("#damage-mult").on("change", (event) => {
                            const mult = parseInt(event.target.value);
                            const base = parseInt(html.find("#damage-base").val());
                            const damage = mult * base;
                            html.find("#damage").val(damage);
                        });

                        const populateSubtypeSelect = (tableName, selectedSubtype) => {
                            const criticalSubtypes = rmss.large_critical_types[tableName] || [];
                            if (criticalSubtypes.length > 0) {
                                html.find("#critical-subtype").empty();
                                criticalSubtypes.forEach((subtype) => {
                                    const sel = subtype === selectedSubtype ? ' selected' : '';
                                    html.find("#critical-subtype").append(`<option value="${subtype}"${sel}>${subtype}</option>`);
                                });
                                html.find("#critical-subtype-container").show();
                            } else {
                                html.find("#critical-subtype-container").hide();
                            }
                        };

                        html.find("#critical-type").on("change", (event) => {
                            const tableName = event.target.value;
                            populateSubtypeSelect(tableName, "normal");
                        });

                        html.find(".is-positive").on("change", (event) => {
                            event.target.value = parseInt(event.target.value) < 0 ? -event.target.value : event.target.value;
                        });

                        // Show subtype selector based on initial crit type; large/superlarge use severity as subtype elsewhere.
                        if (initialContext.useLargeCreatureSeverityLabels) {
                            html.find("#critical-subtype-container").hide();
                        } else if (!initialContext.criticalHasSubtypes) {
                            html.find("#critical-subtype-container").hide();
                        } else {
                            populateSubtypeSelect(initialContext.critType, initialContext.defaultSubtype);
                        }
                    }
                }
            ).render(true);
        });
        return confirmed;
    }

    static async applyCriticalTo(critical, actor, originId) {
        console.log("Applying critical to:", critical, actor, originId);
        return await RMSSEffectApplier.applyCriticalEffects(critical, actor, originId);
    }
    /**
     * NOTE: Due to known issues with ActiveEffect handling in Foundry VTT version 12,
     * specifically with automatic round-based duration, need to fix some issues like
     * token icon effects rendering with undefined duration effects.
     */


    static async applyCriticalToEnemy(critical, enemyId, attackerId, isToken) {
        console.log("Applying critical to enemy:", critical, enemyId, attackerId, isToken);
        let entity;

        if (isToken) {
            const enemy = canvas.scene.tokens.get(enemyId);
            if (!enemy) return ui.notifications.error("Token not found.");
            entity = enemy.actor;
        } else {
            entity = game.actors.get(enemyId);
            if (!entity) return ui.notifications.error("Actor not found.");
        }

        return await RMSSWeaponCriticalManager.applyCriticalTo(critical, entity, attackerId);
    }

    static async chooseCriticalOption(criticalResult) {
        let option = await new Promise((resolve) => {
            new Dialog({
                title: "Elige una opción",
                content: `<p class="critical-description">${criticalResult.text}</p>`,
                buttons: {
                    optionA: {
                        label: `${criticalResult.metadata[0].DESC}`,
                        callback: () => resolve(criticalResult.metadata[0])
                    },
                    optionB: {
                        label: `${criticalResult.metadata[1].DESC}`,
                        callback: () => resolve(criticalResult.metadata[1])
                    }
                },
                default: "optionA"
            }).render(true);
        });

        return option;
    }

    static async getFumbleMessage(attacker) {
        const htmlContent = await renderTemplate("systems/rmss/templates/chat/fumble-result.hbs", {
            attacker: attacker
        });
        const speaker = "Game Master";

        await ChatMessage.create(withPublicRollMode({
            content: htmlContent,
            speaker: speaker
        }));
    }

    /**
     * Show weapon fumble result with Mounted? checkbox to toggle column.
     * @param {Actor} actor - The attacker
     * @param {Item} weapon - The weapon used
     * @param {number} roll - d100 roll for fumble table (1-100)
     * @param {Roll} [rollObj] - Optional Roll for Dice So Nice display
     */
    static async getWeaponFumbleMessage(actor, weapon, roll, rollObj = null) {
        const column = WeaponFumbleService.getColumnForWeaponType(weapon?.system?.type ?? "1he");
        const { description, mountedDescription } = await WeaponFumbleService.getFumbleResult(roll, column);

        const templateData = {
            attacker: { img: actor.img, name: actor.name },
            weapon: weapon ? { name: weapon.name } : null,
            roll,
            description,
            mountedDescription,
            useMounted: false,
            hasMountedOption: !!mountedDescription
        };

        const htmlContent = await renderTemplate("systems/rmss/templates/chat/weapon-fumble-result.hbs", templateData);

        const msgData = {
            content: htmlContent,
            speaker: { alias: "Game Master" },
            flags: {
                rmss: {
                    weaponFumble: templateData
                }
            }
        };
        if (rollObj) msgData.rolls = [rollObj];
        await ChatMessage.create(withPublicRollMode(msgData));
    }

    /**
     * Whether any critical row needs chat roll / GM confirmation (real severity, not HP-only placeholder).
     */
    static hasResolvableCriticalForChat(criticalResult) {
        return (criticalResult.criticals || []).some((c) => {
            const s = c.severity;
            if (s == null || String(s).trim() === "") return false;
            return String(s).trim() !== "null";
        });
    }

    /** True if critical table type is Tiny (not a full A–E column crit). */
    static isTinyCriticalType(critType) {
        const t = String(critType ?? "").trim();
        if (!t) return false;
        if (t === "T") return true;
        return t.toLowerCase() === "tiny";
    }

    /**
     * GM-only whisper when a non-Tiny critical resolves on a creature_attack.
     * The "special" field lives on the **row below** (same/next vs attack above); we read it from that follow-up row,
     * not from the attack that rolled the critical—otherwise the first attack never triggers a reminder.
     *
     * @param {{ attackerId: string, weaponItemId: string, attackerUuid?: string|null, severity: string, critType: string }} params
     */
    static async postCreatureAttackSpecialChainGmReminder(params) {
        const { attackerId, weaponItemId, attackerUuid, severity, critType } = params ?? {};
        if (!attackerId || !weaponItemId) return;
        const sev = String(severity ?? "").trim();
        if (!sev || sev === "null") return;
        if (RMSSWeaponCriticalManager.isTinyCriticalType(critType)) return;

        /** Same resolution as {@link sendCriticalMessage} (token id → token.actor) plus optional UUID for the exact Actor document. */
        let attacker = null;
        if (attackerUuid) {
            try {
                const doc = await fromUuid(attackerUuid);
                if (doc instanceof Actor) attacker = doc;
            } catch (_) {
                /* ignore */
            }
        }
        if (!attacker) attacker = Utils.getActor(attackerId);
        if (!attacker?.items) return;
        let triggeringAttack = attacker.items.get(weaponItemId);
        if (!triggeringAttack) {
            triggeringAttack = attacker.items.find((i) => (i.id ?? i._id) === weaponItemId);
        }
        if (!triggeringAttack || triggeringAttack.type !== "creature_attack") return;

        const ordered = attacker.items
            .filter((i) => i.type === "creature_attack")
            .sort((a, b) => {
                const oa = Number(a.system?.order);
                const ob = Number(b.system?.order);
                return (Number.isFinite(oa) ? oa : 9999) - (Number.isFinite(ob) ? ob : 9999);
            });
        const idx = ordered.findIndex((i) => i.id === triggeringAttack.id);
        const followUpAttack = idx >= 0 && idx < ordered.length - 1 ? ordered[idx + 1] : null;
        if (!followUpAttack) return;

        const special = String(followUpAttack.system?.special ?? "none");
        if (special !== "same" && special !== "next") return;

        const gmIds = game.users.filter((u) => u.isGM).map((u) => u.id);
        if (!gmIds.length) return;

        const key =
            special === "same"
                ? "rmss.creature_attack.gm_chain_reminder_same"
                : "rmss.creature_attack.gm_chain_reminder_next";
        const text = game.i18n.format(key, {
            creatureName: attacker.name,
            triggeringAttack: triggeringAttack.name,
            chainedAttack: followUpAttack.name
        });
        const esc = typeof foundry.utils?.escapeHTML === "function" ? foundry.utils.escapeHTML : (s) => String(s ?? "");
        const banner = esc(game.i18n.localize("rmss.creature_attack.gm_chain_reminder_banner"));
        const bodyHtml = esc(text);
        const content = `
<div class="rmss-creature-attack-gm-reminder" role="status">
  <div class="rmss-creature-attack-gm-reminder__head">
    <i class="fas fa-user-secret" aria-hidden="true"></i>
    <span class="rmss-creature-attack-gm-reminder__title">${banner}</span>
  </div>
  <div class="rmss-creature-attack-gm-reminder__body">${bodyHtml}</div>
</div>`;

        await ChatMessage.create({
            content,
            speaker: { alias: "Game Master" },
            whisper: gmIds
        });
    }

    /**
     * @param {Actor|null} actor
     * @returns {{ id: string, name: string, img: string, uuid: string }}
     */
    static attackerDisplayFromActor(actor) {
        if (!actor) return { id: "", name: "?", img: "", uuid: "" };
        return {
            id: actor.id,
            uuid: actor.uuid ?? "",
            name: actor.name,
            img: actor.img || ""
        };
    }

    /**
     * Token id / name / portrait for critical chat cards (attack table target).
     * @param {Actor|Token|TokenDocument|null} target
     * @returns {{ id: string, name: string, img: string }|null}
     */
    static normalizeCombatChatTarget(target) {
        if (!target) return null;
        if (target instanceof Actor) {
            return { id: target.id, name: target.name, img: target.img || "" };
        }
        const doc = target.document;
        if (doc && doc.actor !== undefined && doc.id != null) {
            const actor = doc.actor;
            const name = doc.name ?? actor?.name ?? "?";
            // Chat cards use actor sheet portrait (same as attack-result), not token ring art
            const img = (actor?.img || doc.texture?.src || "").trim();
            return { id: doc.id, name, img };
        }
        if (target.actor !== undefined && target.id != null && target.items === undefined) {
            const actor = target.actor;
            const name = target.name ?? actor?.name ?? "?";
            const img = (actor?.img || target.texture?.src || "").trim();
            return { id: target.id, name, img };
        }
        return null;
    }

    static async _renderCriticalChatCard(templateData) {
        return renderTemplate("systems/rmss/templates/chat/critical-roll-button.hbs", templateData);
    }

    /**
     * Chat card for hits that only apply HP (no letter critical / no roll buttons).
     * @param {string|number} damageStr - Attack table damage cell (display)
     * @param {{ damage: *, criticals?: unknown[] }} criticalResult
     * @param {Actor} attacker
     * @param {Actor|Token|TokenDocument|null} target
     */
    static async getHpOnlyDamageMessage(damageStr, criticalResult, attacker, target = null) {
        const damageNum = Number(criticalResult?.damage);
        if (!Number.isFinite(damageNum) || damageNum <= 0) return;

        const targetDisplay = RMSSWeaponCriticalManager.normalizeCombatChatTarget(target);
        const attackerDisplay = RMSSWeaponCriticalManager.attackerDisplayFromActor(attacker);
        const targetName = targetDisplay?.name ?? "";
        const hpDamageOnlyLine = game.i18n.format("rmss.combat.hp_damage_only_line", {
            damage: damageNum,
            targetName
        });
        const htmlContent = await RMSSWeaponCriticalManager._renderCriticalChatCard({
            damageStr,
            damage: criticalResult.damage,
            criticals: [],
            attacker: attackerDisplay,
            targetDisplay,
            isNullResult: false,
            hpDamageOnly: true,
            hpDamageOnlyLine,
            mainSeverity: null,
            weaponItemId: null
        });
        await ChatMessage.create(withPublicRollMode({
            content: htmlContent,
            speaker: "Game Master"
        }));
    }

    static async getCriticalMessage(damage, criticalResult, attacker, target = null, isNullResult = false, weapon = null) {
        // Only include criticals with real severity (A–E…); exclude synthetic HP-only rows with no critical
        const criticalsWithSeverity = (criticalResult.criticals || []).filter(
            c => c.severity != null && String(c.severity).trim() !== ""
        );
        const mainSeverity =
            criticalResult.mainSeverity ?? criticalsWithSeverity[0]?.severity ?? null;
        const weaponItemId = weapon?.id ?? weapon?._id ?? null;
        const targetDisplay = RMSSWeaponCriticalManager.normalizeCombatChatTarget(target);
        const attackerDisplay = RMSSWeaponCriticalManager.attackerDisplayFromActor(attacker);
        const htmlContent = await RMSSWeaponCriticalManager._renderCriticalChatCard({
            damageStr: damage,
            damage: criticalResult.damage,
            criticals: criticalsWithSeverity,
            attacker: attackerDisplay,
            targetDisplay,
            isNullResult: isNullResult,
            hpDamageOnly: false,
            hpDamageOnlyLine: "",
            mainSeverity,
            weaponItemId
        });
        const speaker = "Game Master";

        await ChatMessage.create(withPublicRollMode({
            content: htmlContent,
            speaker: speaker
        }));
    }
}