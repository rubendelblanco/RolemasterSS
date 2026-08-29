/**
 * Service for static maneuver rolls (skills with fa-dice icon).
 * Handles the maneuver options dialog and roll execution.
 */
import ManeuverPenaltiesService from "../maneuver_penalties_service.js";
import SkillManeuverService from "./skill_maneuver_service.js";
import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage, whisperIdsForNpcRollPrivacy, dice3dSynchronizeForNpcRoll, chatMessageOtherStyle } from "../../chat/chatMessages.js";

/** Difficulty modifiers */
const DIFFICULTY = {
    routine: 30,
    easy: 20,
    light: 10,
    medium: 0,
    hard: -10,
    very_hard: -20,
    extremely_hard: -30,
    sheer_folly: -50,
    absurd: -70
};

/** Combat situation modifiers */
const COMBAT_SITUATION = {
    none: 0,
    melee: -20,
    missile_fire: -10
};

/** Lighting (if required) modifiers */
const LIGHTING_REQUIRED = {
    no_shadows: 10,
    light_shadows: 5,
    medium_shadows: 0,
    heavy_shadows: -10,
    dark: -25,
    pitch_black: -40
};

/** Darkness (if advantageous) modifiers */
const DARKNESS_ADVANTAGEOUS = {
    no_shadows: -30,
    light_shadows: -20,
    medium_shadows: 0,
    heavy_shadows: 10,
    dark: 30,
    pitch_black: 40
};

export default class ManeuverService {

    /**
     * Get auto-calculated penalties from actor state (all 4 maneuver penalties).
     * @param {Actor} actor
     * @returns {{ hitsTaken: number, bleeding: number, stunned: number, penaltyEffect: number, activeBonus: number }}
     */
    static getAutoPenalties(actor) {
        return ManeuverPenaltiesService.getManeuverPenalties(actor);
    }

    /**
     * Show maneuver options dialog and perform roll.
     * @param {Actor} actor
     * @param {Item} skill - The skill item
     * @returns {Promise<boolean>} true if roll was performed
     */
    /**
     * Skills tied to weapon offense behave like attacks: always public for NPC/creature (no GM-only default).
     * @param {Item} skill
     * @returns {boolean}
     */
    static _isOffensiveCombatSkill(skill) {
        const v = skill?.system?.offensive_skill;
        if (v == null || v === "" || v === "none") return false;
        return String(v).trim() !== "";
    }

    static async rollManeuver(actor, skill) {
        const skillBonus = skill.system?.total_bonus ?? 0;
        const autoPenalties = this.getAutoPenalties(actor);
        const offensiveCombatSkill = this._isOffensiveCombatSkill(skill);

        const result = await this._showManeuverOptionsDialog(actor, {
            skillName: skill.name,
            skillBonus,
            offensiveCombatSkill,
            ...autoPenalties
        });

        if (!result) return false;

        const autoPenaltyTotal = ManeuverPenaltiesService.getTotalAutoPenalty(autoPenalties);
        const totalModifier = skillBonus + autoPenaltyTotal + result.difficulty + result.combatSituation
            + result.lighting + result.darkness + result.otherMods;

        return this._executeManeuverRoll(actor, skill, totalModifier, result.difficultyKey, autoPenalties, result.publicRollToPlayers);
    }

    /**
     * Show the maneuver options dialog.
     * @private
     */
    static async _showManeuverOptionsDialog(actor, { skillName, skillBonus, hitsTaken, bleeding, stunned, penaltyEffect, activeBonus, offensiveCombatSkill = false }) {
        const content = this._buildDialogContent(actor, {
            skillName,
            skillBonus,
            hitsTaken,
            bleeding,
            stunned,
            penaltyEffect: penaltyEffect ?? 0,
            activeBonus: activeBonus ?? 0,
            offensiveCombatSkill
        });

        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.maneuvers.options_title"),
                content,
                buttons: {
                    roll: {
                        icon: '<i class="fas fa-dice"></i>',
                        label: game.i18n.localize("rmss.maneuvers.roll"),
                        callback: (html) => {
                            resolve(this._calculateModifiers(html, { hitsTaken, bleeding, stunned, penaltyEffect, activeBonus }, actor, offensiveCombatSkill) ?? null);
                        }
                    },
                    cancel: {
                        icon: '<i class="fas fa-times"></i>',
                        label: game.i18n.localize("rmss.dialog.cancel"),
                        callback: () => resolve(null)
                    }
                },
                default: "roll",
                close: () => resolve(null),
                render: (html) => this._setupManeuverDialogListeners(html, { skillBonus, hitsTaken, bleeding, stunned, penaltyEffect, activeBonus: activeBonus ?? 0 })
            }, {
                classes: ["rmss", "maneuver-options-dialog"],
                width: 420
            }).render(true);
        });
    }

    /**
     * Attach change listeners to update total modifier display.
     * @private
     */
    static _setupManeuverDialogListeners(html, { skillBonus, hitsTaken, bleeding, stunned, penaltyEffect = 0, activeBonus = 0 }) {
        const form = html.find(".maneuver-options-form")[0];
        if (!form) return;

        const updateTotal = () => {
            const diff = DIFFICULTY[form.querySelector('[name="difficulty"]')?.value] ?? 0;
            const combat = COMBAT_SITUATION[form.querySelector('[name="combatSituation"]')?.value] ?? 0;
            const light = LIGHTING_REQUIRED[form.querySelector('[name="lighting"]')?.value] ?? 0;
            const dark = DARKNESS_ADVANTAGEOUS[form.querySelector('[name="darkness"]')?.value] ?? 0;
            const other = parseInt(form.querySelector('[name="otherMods"]')?.value) || 0;
            const penaltyMod = Math.min(0, penaltyEffect);
            const total = skillBonus + hitsTaken + bleeding + stunned + penaltyMod + activeBonus + diff + combat + light + dark + other;
            const sign = total >= 0 ? "+" : "";
            const span = form.querySelector("#maneuver-total-modifier");
            if (span) span.innerHTML = `<strong>${sign}${total}</strong>`;
        };

        html.find("select, input").on("change input", updateTotal);
        updateTotal();
    }

    /**
     * Build dialog HTML content.
     * @private
     */
    static _buildDialogContent(actor, { skillName, skillBonus, hitsTaken, bleeding, stunned, penaltyEffect = 0, activeBonus = 0, offensiveCombatSkill = false }) {
        const showPublicRollCheckbox = actor && (actor.type === "npc" || actor.type === "creature") && !offensiveCombatSkill;
        const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);
        const sel = (k, def) => (k === def ? " selected" : "");
        const difficultyOpts = Object.entries(DIFFICULTY).map(([k, v]) =>
            `<option value="${k}"${sel(k, "medium")}>${game.i18n.localize(`rmss.maneuvers.difficulty.${k}`)} (${fmt(v)})</option>`
        ).join("");
        const combatOpts = Object.entries(COMBAT_SITUATION).map(([k, v]) =>
            `<option value="${k}">${game.i18n.localize(`rmss.maneuvers.combat.${k}`)} (${fmt(v)})</option>`
        ).join("");
        const lightingOpts = Object.entries(LIGHTING_REQUIRED).map(([k, v]) =>
            `<option value="${k}"${sel(k, "medium_shadows")}>${game.i18n.localize(`rmss.maneuvers.lighting.${k}`)} (${fmt(v)})</option>`
        ).join("");
        const darknessOpts = Object.entries(DARKNESS_ADVANTAGEOUS).map(([k, v]) =>
            `<option value="${k}"${sel(k, "medium_shadows")}>${game.i18n.localize(`rmss.maneuvers.darkness.${k}`)} (${fmt(v)})</option>`
        ).join("");
        const penaltyDisplay = Math.min(0, penaltyEffect);

        return `
            <form class="maneuver-options-form">
                <div class="form-group" style="margin-bottom:8px;">
                    <strong>${skillName}</strong>
                    <div style="font-size:0.9em; color:#666;">${game.i18n.localize("rmss.maneuvers.skill_bonus")}: ${fmt(skillBonus)}</div>
                </div>
                <hr style="margin:8px 0; border:none; border-top:1px solid #ccc;">
                <div class="form-group" style="font-size:0.9em; color:#555;">
                    <div>${game.i18n.localize("rmss.maneuvers.hits_taken")}: ${fmt(hitsTaken)}</div>
                    <div>${game.i18n.localize("rmss.maneuvers.bleeding")}: ${fmt(bleeding)}</div>
                    <div>${game.i18n.localize("rmss.maneuvers.stunned")}: ${fmt(stunned)}</div>
                    ${penaltyEffect !== 0 ? `<div>${game.i18n.localize("rmss.combat.penalty")}: ${fmt(penaltyDisplay)}</div>` : ""}
                    ${activeBonus !== 0 ? `<div>${game.i18n.localize("rmss.maneuvers.active_effect_bonus")}: ${fmt(activeBonus)}</div>` : ""}
                </div>
                <hr style="margin:8px 0; border:none; border-top:1px solid #ccc;">
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.maneuvers.difficulty_label")}</label>
                    <select name="difficulty">${difficultyOpts}</select>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.maneuvers.combat_label")}</label>
                    <select name="combatSituation">${combatOpts}</select>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.maneuvers.lighting_label")}</label>
                    <select name="lighting">${lightingOpts}</select>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.maneuvers.darkness_label")}</label>
                    <select name="darkness">${darknessOpts}</select>
                </div>
                <div class="form-group">
                    <label>${game.i18n.localize("rmss.maneuvers.other_mods")}</label>
                    <input type="number" name="otherMods" value="0" style="width:80px;"/>
                </div>
                ${showPublicRollCheckbox ? `
                <div class="form-group" style="margin-top:8px;">
                    <label class="flexrow" style="align-items:center; gap:8px;">
                        <input type="checkbox" name="publicRollToPlayers"/>
                        <span>${game.i18n.localize("rmss.chat.public_roll_to_players")}</span>
                    </label>
                    <p class="notes" style="margin:4px 0 0 0; font-size:0.85em; color:#666;">${game.i18n.localize("rmss.chat.public_roll_to_players_hint")}</p>
                </div>
                ` : ""}
                <hr style="margin:8px 0; border:none; border-top:1px solid #ccc;">
                <div class="form-group">
                    <label><strong>${game.i18n.localize("rmss.maneuvers.total_modifier")}:</strong></label>
                    <span id="maneuver-total-modifier"><strong>+0</strong></span>
                </div>
            </form>
        `;
    }

    /**
     * Extract modifier values from dialog.
     * @private
     */
    static _calculateModifiers(html, { hitsTaken, bleeding, stunned, penaltyEffect }, actor, offensiveCombatSkill = false) {
        const form = html.find("form")[0];
        if (!form) return null;
        const fd = new FormData(form);
        const difficultyKey = fd.get("difficulty") || "medium";
        const difficulty = DIFFICULTY[difficultyKey] ?? 0;
        const combatSituation = COMBAT_SITUATION[fd.get("combatSituation")] ?? 0;
        const lighting = LIGHTING_REQUIRED[fd.get("lighting")] ?? 0;
        const darkness = DARKNESS_ADVANTAGEOUS[fd.get("darkness")] ?? 0;
        const otherMods = parseInt(fd.get("otherMods")) || 0;
        const showPublicRoll = actor && (actor.type === "npc" || actor.type === "creature") && !offensiveCombatSkill;
        const publicRollToPlayers = !showPublicRoll || !!form.querySelector('[name="publicRollToPlayers"]')?.checked;
        return {
            difficulty,
            difficultyKey,
            combatSituation,
            lighting,
            darkness,
            otherMods,
            publicRollToPlayers
        };
    }

    /**
     * Execute the maneuver roll and post to chat.
     * @param {string} difficultyKey - Key for XP lookup (routine, easy, medium, etc.)
     * @private
     */
    static async _executeManeuverRoll(actor, skill, totalModifier, difficultyKey = "medium", autoPenalties = {}, publicRollToPlayers = true) {
        const syncDice3d = dice3dSynchronizeForNpcRoll(actor, publicRollToPlayers);
        const roll = await new Roll("1d100x>95").evaluate();
        const naturalRoll = roll.dice[0].results[0].result;
        const rollTotal = naturalRoll === 100 ? 100 : roll.total;
        // RMSS: 01-02 and 100 are unmodified (no skill bonus). 96-99 explosive DO get bonus added to rollTotal.
        const isUnmodified = naturalRoll <= 2 || naturalRoll === 100;
        // Use rollTotal (includes explosion for 96-99) and add modifier when not unmodified
        const finalResult = isUnmodified ? rollTotal : rollTotal + totalModifier;

        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, syncDice3d);
        }

        const maneuverResult = await SkillManeuverService.getResult(finalResult, naturalRoll);
        const resultClass = maneuverResult ? SkillManeuverService.getResultClass(maneuverResult.code) : "";

        // Award XP for Success, Unusual Success, Absolute Success (characters only)
        const successCodes = ["success", "unusual_success", "absolute_success"];
        if (maneuverResult && successCodes.includes(maneuverResult.code) && actor.type === "character") {
            const xp = ExperiencePointsCalculator.data.maneuverExpPoints[difficultyKey] ?? 0;
            if (xp > 0) {
                const totalExpActor = parseInt(actor.system.attributes.experience_points.value) + xp;
                await actor.update({ "system.attributes.experience_points.value": totalExpActor });
                const breakDown = { maneuver: xp, spell: 0, critical: 0, kill: 0, bonus: 0, misc: 0 };
                await sendExpMessage(actor, breakDown, xp);
            }
        }

        const isExplosive = rollTotal !== naturalRoll;
        const fmt = (n) => (n >= 0 ? `+${n}` : `${n}`);
        const { hitsTaken = 0, bleeding = 0, stunned = 0, penaltyEffect = 0, activeBonus = 0 } = autoPenalties;
        const penaltyLines = [
            hitsTaken !== 0 ? `<div>💔 ${game.i18n.localize("rmss.maneuvers.hits_taken")}: <strong>${fmt(hitsTaken)}</strong></div>` : "",
            bleeding !== 0 ? `<div>🩸 ${game.i18n.localize("rmss.maneuvers.bleeding")}: <strong>${fmt(bleeding)}</strong></div>` : "",
            stunned !== 0 ? `<div>😵 ${game.i18n.localize("rmss.maneuvers.stunned")}: <strong>${fmt(stunned)}</strong></div>` : "",
            penaltyEffect !== 0 ? `<div>🩹 ${game.i18n.localize("rmss.combat.penalty")}: <strong>${fmt(Math.min(0, penaltyEffect))}</strong></div>` : "",
            activeBonus !== 0
                ? `<div>➕ ${game.i18n.localize("rmss.maneuvers.active_effect_bonus")}: <strong>${fmt(activeBonus)}</strong></div>`
                : ""
        ].filter(Boolean).join("");
        const content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${actor.img}" alt="${actor.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000; display: flex; align-items: center; gap: 6px;">
                            <img src="${skill.img || 'icons/svg/dice-target.svg'}" alt="" width="24" height="24" style="border-radius: 4px; flex-shrink: 0;">
                            ${game.i18n.localize("rmss.maneuvers.static_maneuver")}
                        </h4>
                        <div style="font-size: 0.9em; color: #fff;">
                            ${actor.name} — ${skill.name}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #fff;">
                    <div>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${naturalRoll}</strong>${isExplosive ? ` → <strong style="color: orange;">${rollTotal}</strong> 💥` : ""}${isUnmodified ? ` <em style="color:#aaa;">(${game.i18n.localize("rmss.spells.unmodified")})</em>` : ""}</div>
                    <div>📊 ${game.i18n.localize("rmss.maneuvers.modifier")}: ${totalModifier >= 0 ? "+" : ""}${totalModifier}</div>
                    ${penaltyLines}
                    <div>📈 Total: <strong>${finalResult}</strong></div>
                </div>
                ${maneuverResult ? `
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div class="maneuver-result ${resultClass}">
                    <div style="font-weight: bold; color: #ffd700;">${maneuverResult.name}</div>
                    <div style="font-size: 0.9em; color: #eee; margin-top: 4px;">${maneuverResult.description}</div>
                </div>
                ` : ""}
            </div>
        `;

        // Run the skill's own attached macro (if any), same mechanism spells/weapons use.
        // Deliberately NOT skill.use() - for skills that also fires "rmssItemUsed", which
        // combat/hooks.js bridges back into rollManeuver (that's what makes a skill dragged
        // to the hotbar re-open this same dialog); calling the full use() here would recurse.
        await skill._executeItemMacro();
        this._playSkillUseVfx(actor, skill, maneuverResult);

        const whisper = whisperIdsForNpcRollPrivacy(actor, publicRollToPlayers);
        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            ...chatMessageOtherStyle(),
            ...(whisper ? { whisper } : {})
        });

        return true;
    }

    /**
     * Green/yellow/red/purple for success/partial/failure/unusual event, matching the exact
     * colors the maneuver result already uses in the chat card (rmss.css .maneuver-result.result-*).
     * Null only when there's no result at all (e.g. table failed to load).
     * @private
     */
    static _resultBorderColor(maneuverResult) {
        switch (SkillManeuverService.getResultClass(maneuverResult?.code)) {
            case "result-success":
            case "result-critical-success":
                return 0x228b22;
            case "result-partial":
                return 0xcc9900;
            case "result-failure":
            case "result-critical-failure":
                return 0xcc0000;
            case "result-unusual":
                return 0x8b008b;
            default:
                return null;
        }
    }

    /**
     * Float the skill's own icon up from its actor's token and fade it out - generic
     * "what is this character doing" feedback for every skill roll, no per-skill setup.
     * Rimmed in green/yellow/red for success/partial/failure so the outcome reads at a
     * glance on the map. No-op if the Sequencer module isn't active or the actor has no
     * token on the scene.
     * @private
     */
    static _playSkillUseVfx(actor, skill, maneuverResult) {
        if (!game.modules.get("sequencer")?.active) return;
        const token = actor?.getActiveTokens()?.[0];
        if (!token || !skill.img) return;

        try {
            const floatDistance = canvas.grid.size * 1.5;
            const targetY = token.center.y - floatDistance;
            const borderColor = this._resultBorderColor(maneuverResult);

            const effect = new Sequence()
                .effect()
                    .file(skill.img)
                    .atLocation(token)
                    .scaleToObject(0.8)
                    .shape("circle", { radius: 0.5, gridUnits: true, isMask: true })
                    .moveTowards({ x: token.center.x, y: targetY }, { rotate: false, ease: "easeOutSine" })
                    .duration(2000)
                    .fadeIn(300)
                    .fadeOut(800)
                    .opacity(0.8);

            if (borderColor !== null) {
                effect.filter("Glow", { color: borderColor, distance: 6, outerStrength: 6, innerStrength: 0, quality: 0.9 });
            }

            effect.play();
        } catch (err) {
            console.error("[RMSS] Skill use VFX error:", err);
        }
    }
}
