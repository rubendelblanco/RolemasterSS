import BaseSpellService from "./base_spell_service.js";
import SpellCalculationService from "./spell_calculation_service.js";
import CastingOptionsService from "./casting_options_service.js";

/**
 * Service to handle Force (F) type spell casting.
 * Manages the flow: casting options -> skill lookup -> roll -> Basic Spell Attack Table -> RR modifier -> RR calculation
 */
export default class ForceSpellService {

    /**
     * Cast a Force type spell.
     * @param {Object} params
     * @param {Actor} params.actor - The caster actor
     * @param {Item} params.spell - The spell being cast
     * @param {string} params.spellListName - Name of the spell list (to find matching skill)
     * @param {string} params.spellListRealm - Realm of the spell list
     */
    static async castForceSpell({ actor, spell, spellListName, spellListRealm }) {
        // Determine realm for casting options
        const effectiveRealm = spellListRealm || actor.system.fixed_info?.realm || "essence";
        
        // Show casting options dialog first
        const castingOptions = await CastingOptionsService.showCastingOptionsDialog({
            realm: effectiveRealm,
            spellType: spell.system.type,
            spellName: spell.name
        });

        // If user cancelled the dialog, abort
        if (castingOptions === null) {
            return;
        }

        const castingModifier = castingOptions.totalModifier;

        // Find the skill with the same name as the spell list
        const skill = actor.items.find(i => 
            i.type === "skill" && i.name === spellListName
        );

        if (!skill) {
            ui.notifications.warn(game.i18n.localize("rmss.spells.no_skill_found") + `: ${spellListName}`);
            return;
        }

        const skillBonus = skill.system.total_bonus ?? 0;

        // Get targets
        const targets = Array.from(game.user.targets);
        const hasTargets = targets.length > 0;

        // Roll the dice (NOT open-ended for base spell attacks)
        const roll = await new Roll("1d100").evaluate();
        const naturalRoll = roll.total;
        
        // Show dice animation if Dice So Nice is active
        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
        }
        
        // Unmodified rolls: 01-02 and 96-100 (don't add skill bonus or casting modifiers)
        // Modified rolls: 03-95 (add skill bonus and casting modifiers)
        const isUnmodified = naturalRoll <= 2 || naturalRoll >= 96;
        const totalBonus = skillBonus + castingModifier;
        const finalResult = isUnmodified ? naturalRoll : naturalRoll + totalBonus;

        // If there are targets, get the RR modifier from Basic Spell Attack Table for EACH target
        let isFumble = false;
        let targetRRs = [];

        if (hasTargets) {
            // Determine realm: use spell list realm, or fall back to actor's realm for base lists
            const effectiveRealm = spellListRealm || actor.system.fixed_info?.realm || "essence";
            const realm = this._normalizeRealm(effectiveRealm);
            const casterLevel = actor.system.attributes?.level?.value ?? 1;
            
            // Process each target separately (different armor types)
            for (const target of targets) {
                const targetActor = target.actor;
                const targetLevel = targetActor?.system?.attributes?.level?.value ?? 1;
                
                // Get the RR modifier from the table for THIS target
                // Each target may have different armor/helmet type
                const spellResult = await BaseSpellService.getBaseSpellResult({
                    realm: realm,
                    naturalRoll: naturalRoll,
                    modifier: isUnmodified ? 0 : totalBonus,
                    targetName: target.name
                });

                // If user cancelled the dialog, skip this target
                if (spellResult === null) {
                    continue;
                }

                const { result, subindices } = spellResult;

                if (result === "F") {
                    // Fumble affects the caster, not individual targets
                    isFumble = true;
                    break; // Stop processing targets on fumble
                }
                
                const rrModifier = result;
                
                // Calculate base RR from level difference
                const baseRR = SpellCalculationService.calculateResistanceRoll({
                    casterLevel: casterLevel,
                    targetLevel: targetLevel
                });
                
                // Apply modifier: RR final = max(0, baseRR - modifier)
                const finalRR = Math.max(0, baseRR - rrModifier);
                
                // Format subindices for display
                const subindexDisplay = Object.values(subindices).join(" / ");
                
                targetRRs.push({
                    name: target.name,
                    baseRR: baseRR,
                    finalRR: finalRR,
                    targetLevel: targetLevel,
                    rrModifier: rrModifier,
                    subindex: subindexDisplay
                });
            }
        }

        // Create chat message
        await this._createChatMessage({
            actor,
            spell,
            spellListName,
            skillBonus,
            castingModifier,
            naturalRoll,
            finalResult,
            isUnmodified,
            targets,
            isFumble,
            targetRRs,
            casterLevel: actor.system.attributes?.level?.value ?? 1
        });

        // Execute spell macro if exists
        await this._executeSpellMacro({
            spell,
            actor,
            targets,
            naturalRoll,
            finalResult,
            isFumble,
            targetRRs
        });
    }

    /**
     * Execute the macro attached to the spell if it exists.
     * @param {Object} params
     * @param {Item} params.spell - The spell item
     * @param {Actor} params.actor - The caster actor
     * @param {Array} params.targets - Array of targeted tokens
     * @param {number} params.naturalRoll - The natural d100 roll
     * @param {number} params.finalResult - The final roll result (with modifiers)
     * @param {boolean} params.isFumble - Whether the roll was a fumble
     * @param {Array} params.targetRRs - Array of target RR data
     */
    static async _executeSpellMacro({ spell, actor, targets, naturalRoll, finalResult, isFumble, targetRRs }) {
        const macroData = spell.getFlag("rmss", "macro");
        if (!macroData || !macroData.command?.trim()) return;

        try {
            const AsyncFunction = Object.getPrototypeOf(async function(){}).constructor;
            const fn = new AsyncFunction(
                'spell', 'actor', 'targets', 'naturalRoll', 'finalResult', 'isFumble', 'targetRRs',
                macroData.command
            );
            await fn(spell, actor, targets, naturalRoll, finalResult, isFumble, targetRRs);
        } catch (err) {
            console.error("Error executing spell macro:", err);
            ui.notifications.error(`Spell macro error: ${err.message}`);
        }
    }

    /**
     * Perform an open-ended roll (exploding on 96+ and 01-05).
     * @returns {Promise<{naturalRoll: number, total: number}>}
     */
    static async _rollOpenEnded() {
        let total = 0;
        let naturalRoll = 0;
        let isFirst = true;
        let keepRolling = true;
        let direction = 0; // 0 = undetermined, 1 = high, -1 = low

        while (keepRolling) {
            const roll = await new Roll("1d100").evaluate();
            const result = roll.total;

            if (isFirst) {
                naturalRoll = result;
                total = result;
                isFirst = false;

                // Determine direction
                if (result >= 96) {
                    direction = 1; // High open-ended
                } else if (result <= 5) {
                    direction = -1; // Low open-ended
                } else {
                    keepRolling = false;
                }
            } else {
                // Subsequent rolls
                if (direction === 1) {
                    total += result;
                    keepRolling = result >= 96;
                } else if (direction === -1) {
                    total -= result;
                    keepRolling = result <= 5;
                }
            }
        }

        return { naturalRoll, total };
    }

    /**
     * Normalize realm string for hybrid realms.
     * Converts "essence/channeling" to ["essence", "channeling"], etc.
     * Also handles "arcane" -> "essence" conversion.
     * @param {string} realm
     * @returns {string|string[]}
     */
    static _normalizeRealm(realm) {
        if (!realm) return "essence";
        
        const lowerRealm = realm.toLowerCase().trim();
        
        // Handle hybrid realms (e.g., "essence/channeling")
        if (lowerRealm.includes("/")) {
            return lowerRealm.split("/").map(r => {
                const trimmed = r.trim();
                return trimmed === "arcane" ? "essence" : trimmed;
            });
        }
        
        // Single realm - convert arcane to essence
        return lowerRealm === "arcane" ? "essence" : lowerRealm;
    }

    /**
     * Create the chat message with the spell cast results.
     */
    static async _createChatMessage({
        actor,
        spell,
        spellListName,
        skillBonus,
        castingModifier = 0,
        naturalRoll,
        finalResult,
        isUnmodified = false,
        targets,
        isFumble,
        targetRRs = [],
        casterLevel = 1
    }) {
        const hasTargets = targets.length > 0;
        const totalBonus = skillBonus + castingModifier;
        const formatMod = (n) => n >= 0 ? `+${n}` : `${n}`;
        
        let content = `
            <div class="rmss-spell-cast">
                <h3>${spell.name}</h3>
                <p><strong>${spellListName}</strong> (${game.i18n.localize("rmss.spells.cast_result")})</p>
                <div class="spell-cast-details">
                    <p>🎲 Roll: <strong>${naturalRoll}</strong>${isUnmodified ? ' <em>(Unmodified)</em>' : ''}</p>
                    ${!isUnmodified ? `
                    <p>📊 Skill: <strong>${formatMod(skillBonus)}</strong></p>
                    ${castingModifier !== 0 ? `<p>🎯 Casting: <strong>${formatMod(castingModifier)}</strong></p>` : ''}
                    ` : ''}
                    <p>📈 Total: <strong>${finalResult}</strong></p>
                </div>
        `;

        if (hasTargets) {
            if (isFumble) {
                content += `
                    <div class="spell-fumble">
                        <p>💥 <strong>${game.i18n.localize("rmss.spells.spell_fumble")}</strong></p>
                    </div>
                `;
            } else if (targetRRs.length > 0) {
                content += `
                    <div class="spell-rr-results">
                        <p><strong>${game.i18n.localize("rmss.spells.targets_must_roll")}:</strong></p>
                        <table class="spell-rr-table">
                            <thead>
                                <tr>
                                    <th>Target</th>
                                    <th>Lvl</th>
                                    <th>Mod</th>
                                    <th>RR</th>
                                </tr>
                            </thead>
                            <tbody>
                `;
                
                for (const targetRR of targetRRs) {
                    const modDisplay = targetRR.rrModifier >= 0 ? `+${targetRR.rrModifier}` : targetRR.rrModifier;
                    content += `
                                <tr>
                                    <td>
                                        ${targetRR.name}
                                        <div class="spell-rr-subindex">${targetRR.subindex}</div>
                                    </td>
                                    <td>${targetRR.targetLevel}</td>
                                    <td>${modDisplay}</td>
                                    <td><strong>${targetRR.finalRR}</strong></td>
                                </tr>
                    `;
                }
                
                content += `
                            </tbody>
                        </table>
                        <p class="spell-rr-note">(Caster Lvl: ${casterLevel})</p>
                    </div>
                `;
            }
        }

        content += `</div>`;

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });
    }
}
