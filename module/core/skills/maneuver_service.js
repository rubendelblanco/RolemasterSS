/**
 * Service for static maneuver rolls (skills with fa-dice icon).
 * Handles the maneuver options dialog and roll execution.
 */
import { RMSSWeaponSkillManager } from "../../combat/rmss_weapon_skill_manager.js";
import Utils from "../../utils.js";
import SkillManeuverService from "./skill_maneuver_service.js";
import ExperiencePointsCalculator from "../../sheets/experience/rmss_experience_manager.js";
import { sendExpMessage } from "../../chat/chatMessages.js";

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
     * Get auto-calculated penalties from actor state.
     * @param {Actor} actor
     * @returns {{ hitsTaken: number, bleeding: number, stunned: number }}
     */
    static getAutoPenalties(actor) {
        const hitsTaken = RMSSWeaponSkillManager._getHitsPenalty(actor);

        let bleeding = 0;
        const bleedingEffects = Utils.getEffectByName(actor, "Bleeding");
        bleedingEffects.forEach(e => {
            bleeding += (e.flags?.rmss?.value ?? 0);
        });
        bleeding = -5 * bleeding;

        let stunned = 0;
        const stunEffects = Utils.getEffectByName(actor, "Stunned");
        const isStunned = stunEffects.some(e => (e.duration?.rounds ?? 0) > 0);
        if (isStunned) {
            const sdBonus = actor.type === "character"
                ? (actor.system?.stats?.self_discipline?.stat_bonus ?? 0)
                : 0;
            stunned = -50 + (3 * sdBonus);
        }

        return { hitsTaken, bleeding, stunned };
    }

    /**
     * Show maneuver options dialog and perform roll.
     * @param {Actor} actor
     * @param {Item} skill - The skill item
     * @returns {Promise<boolean>} true if roll was performed
     */
    static async rollManeuver(actor, skill) {
        const skillBonus = skill.system?.total_bonus ?? 0;
        const autoPenalties = this.getAutoPenalties(actor);

        const result = await this._showManeuverOptionsDialog({
            skillName: skill.name,
            skillBonus,
            ...autoPenalties
        });

        if (!result) return false;

        const totalModifier = skillBonus + autoPenalties.hitsTaken + autoPenalties.bleeding
            + autoPenalties.stunned + result.difficulty + result.combatSituation
            + result.lighting + result.darkness + result.otherMods;

        return this._executeManeuverRoll(actor, skill, totalModifier, result.difficultyKey);
    }

    /**
     * Show the maneuver options dialog.
     * @private
     */
    static async _showManeuverOptionsDialog({ skillName, skillBonus, hitsTaken, bleeding, stunned }) {
        const content = this._buildDialogContent({
            skillName,
            skillBonus,
            hitsTaken,
            bleeding,
            stunned
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
                            resolve(this._calculateModifiers(html, { hitsTaken, bleeding, stunned }) ?? null);
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
                render: (html) => this._setupManeuverDialogListeners(html, { skillBonus, hitsTaken, bleeding, stunned })
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
    static _setupManeuverDialogListeners(html, { skillBonus, hitsTaken, bleeding, stunned }) {
        const form = html.find(".maneuver-options-form")[0];
        if (!form) return;

        const updateTotal = () => {
            const diff = DIFFICULTY[form.querySelector('[name="difficulty"]')?.value] ?? 0;
            const combat = COMBAT_SITUATION[form.querySelector('[name="combatSituation"]')?.value] ?? 0;
            const light = LIGHTING_REQUIRED[form.querySelector('[name="lighting"]')?.value] ?? 0;
            const dark = DARKNESS_ADVANTAGEOUS[form.querySelector('[name="darkness"]')?.value] ?? 0;
            const other = parseInt(form.querySelector('[name="otherMods"]')?.value) || 0;
            const total = skillBonus + hitsTaken + bleeding + stunned + diff + combat + light + dark + other;
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
    static _buildDialogContent({ skillName, skillBonus, hitsTaken, bleeding, stunned }) {
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
    static _calculateModifiers(html, { hitsTaken, bleeding, stunned }) {
        const form = html.find("form")[0];
        if (!form) return null;
        const fd = new FormData(form);
        const difficultyKey = fd.get("difficulty") || "medium";
        const difficulty = DIFFICULTY[difficultyKey] ?? 0;
        const combatSituation = COMBAT_SITUATION[fd.get("combatSituation")] ?? 0;
        const lighting = LIGHTING_REQUIRED[fd.get("lighting")] ?? 0;
        const darkness = DARKNESS_ADVANTAGEOUS[fd.get("darkness")] ?? 0;
        const otherMods = parseInt(fd.get("otherMods")) || 0;
        return {
            difficulty,
            difficultyKey,
            combatSituation,
            lighting,
            darkness,
            otherMods
        };
    }

    /**
     * Execute the maneuver roll and post to chat.
     * @param {string} difficultyKey - Key for XP lookup (routine, easy, medium, etc.)
     * @private
     */
    static async _executeManeuverRoll(actor, skill, totalModifier, difficultyKey = "medium") {
        const roll = await new Roll("1d100x>95").evaluate();
        const naturalRoll = roll.dice[0].results[0].result;
        const rollTotal = naturalRoll === 100 ? 100 : roll.total;
        const isUnmodified = naturalRoll <= 2 || naturalRoll >= 96;
        const finalResult = isUnmodified ? rollTotal : naturalRoll + totalModifier;

        if (game.dice3d) {
            await game.dice3d.showForRoll(roll, game.user, true);
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
        const content = `
            <div style="border: 1px solid #555; border-radius: 8px; padding: 8px 10px; background: rgba(0,0,0,0.25); box-shadow: 0 0 6px rgba(0,0,0,0.4);">
                <div style="display: flex; align-items: center; gap: 8px; margin-bottom: 6px;">
                    <img src="${actor.img}" alt="${actor.name}" width="48" height="48" style="border-radius: 6px; border: 1px solid #333;">
                    <div>
                        <h4 style="margin: 0; color: #ffd700; text-shadow: 0 0 4px #000;">
                            🎲 ${game.i18n.localize("rmss.maneuvers.static_maneuver")}
                        </h4>
                        <div style="font-size: 0.9em; color: #ccc;">
                            ${actor.name} — ${skill.name}
                        </div>
                    </div>
                </div>
                <hr style="border: none; border-top: 1px solid #333; margin: 6px 0;">
                <div style="font-size: 0.9em; color: #ddd;">
                    <div>🎲 ${game.i18n.localize("rmss.spells.roll")}: <strong>${naturalRoll}</strong>${isExplosive ? ` → <strong style="color: orange;">${rollTotal}</strong> 💥` : ""}${isUnmodified ? ` <em style="color:#aaa;">(${game.i18n.localize("rmss.spells.unmodified")})</em>` : ""}</div>
                    <div>📊 ${game.i18n.localize("rmss.maneuvers.modifier")}: ${totalModifier >= 0 ? "+" : ""}${totalModifier}</div>
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

        await ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content,
            type: CONST.CHAT_MESSAGE_TYPES.OTHER
        });

        return true;
    }
}
