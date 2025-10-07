import LevelUpManager from "../experience/rmss_level_up_manager.js";

/**
 * Service to handle stat-related operations (potential and level-up rolls).
 */
export default class StatService {
    /**
     * Determine the roll formula based on a potential stat value.
     * @param {number} value - The potential stat value.
     * @returns {string|null} A valid roll formula (e.g. "20+8d10"), or null.
     */
    static getRollFormulaForPotential(value) {
        const ranges = [
            { min: 20, max: 24, formula: "20+8d10" },
            { min: 25, max: 34, formula: "30+7d10" },
            { min: 35, max: 44, formula: "40+6d10" },
            { min: 45, max: 54, formula: "50+5d10" },
            { min: 55, max: 64, formula: "60+4d10" },
            { min: 65, max: 74, formula: "70+3d10" },
            { min: 75, max: 84, formula: "80+2d10" },
            { min: 85, max: 91, formula: "90+1d10" }
        ];

        for (const range of ranges) {
            if (value >= range.min && value <= range.max) return range.formula;
        }

        if (value >= 92 && value <= 99) {
            const variableRoll = 100 - value + 1;
            return `${value}+1d${variableRoll}`;
        }

        if (value === 100) return "99+1d10";
        return null;
    }

    /**
     * Handle a stat roll click depending on actor state.
     * If actor is level 0 → potential roll.
     * If actor is leveling up → level-up stat roll.
     *
     * @param {Actor} actor - The actor performing the roll.
     * @param {HTMLElement} clickedElement - The clicked dice element.
     * @param {HTMLElement} potentialInput - The input for potential stat value.
     * @returns {Promise<void>}
     */
    static async handleStatRoll(actor, clickedElement, potentialInput) {
        const parentLi = clickedElement.closest("li");
        if (!parentLi) return;

        const tempStatElement = parentLi.querySelector(".stat-temp");
        if (!tempStatElement) return;

        if (actor.system.levelUp.isLevelZero) {
            // --- LEVEL 0: potential roll ---
            await this._handlePotentialRoll(actor, tempStatElement, potentialInput);
        } else if (actor.system.levelUp.isLevelingUp) {
            // --- LEVEL-UP: normal stat roll ---
            await this._handleLevelUpStatRoll(actor, clickedElement);
        }
    }

    /**
     * Internal: handle potential stat roll (level 0 only).
     */
    static async _handlePotentialRoll(actor, tempElement, potentialInput) {
        const inputValue = Number(tempElement.value);
        const formula = this.getRollFormulaForPotential(inputValue);
        if (!formula) {
            ui.notifications.warn("Invalid potential stat value for rolling.");
            return;
        }

        const roll = new Roll(formula);
        await roll.evaluate();

        await ChatMessage.create({
            user: game.user.id,
            speaker: ChatMessage.getSpeaker(),
            content: game.i18n.format("rmss.chat.potential_roll", {
                total: roll.total,
                result: roll.result
            }),
            roll
        });

        const finalValue = roll.total < inputValue ? inputValue : roll.total;
        potentialInput.value = finalValue;

        await actor.update({ [potentialInput.name]: finalValue });
    }

    /**
     * Internal: handle stat roll during level-up phase.
     */
    static async _handleLevelUpStatRoll(actor, clickedElement) {
        let dps = parseInt(actor.system.levelUp.developmentPoints);
        if (dps < 8) {
            ui.notifications.warn("Not enough development points to roll a stat.");
            return;
        }

        dps -= 8;
        const statPath = clickedElement.dataset.stat;
        const statName = statPath.split(".")[2];
        const stat = foundry.utils.getProperty(actor.system, `stats.${statName}`);

        await LevelUpManager.handleStatRoll(actor, statName, stat);
        await actor.update({ "system.levelUp.developmentPoints": dps });
    }
}
