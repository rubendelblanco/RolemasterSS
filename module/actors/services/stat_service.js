
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
     * Roll potential from a temp value (same logic as dice click).
     * @param {number} tempValue - The temp stat value.
     * @param {string} [statName] - Optional stat name for chat context.
     * @param {Actor} [actor] - Optional actor for chat header.
     * @returns {Promise<number>} The potential value (max of temp and roll).
     */
    static async rollPotentialFromTemp(tempValue, statName = "", actor = null) {
        const formula = this.getRollFormulaForPotential(tempValue);
        if (!formula) return tempValue;

        const roll = new Roll(formula);
        await roll.evaluate();

        const statLabel = statName ? ` - ${game.i18n.localize(`rmss.player_character.attribute.${statName}`) || statName}` : "";
        const actorName = actor?.name || "";
        const actorImg = actor?.img || "";

        const content = `
            <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                ${actorImg ? `<img src="${actorImg}" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" />` : ""}
                <div>
                  <p style="color: #333; font-size: 16px; margin: 0;">
                    ${game.i18n.format("rmss.chat.potential_roll", {
                        total: roll.total,
                        result: roll.result
                    })}${statLabel}
                  </p>
                  ${actorName ? `<p style="color: #555; font-size: 14px; margin: 4px 0 0 0;">${actorName}</p>` : ""}
                </div>
              </div>
            </div>
        `;
        await ChatMessage.create({
            user: game.user.id,
            speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
            content,
            roll
        });

        return roll.total < tempValue ? tempValue : roll.total;
    }

    /**
     * Roll potential for all stats and create a single chat message.
     * @param {Object.<string, number>} stats - { statName: tempValue }
     * @param {Actor} actor - The actor these rolls belong to.
     * @returns {Promise<Object.<string, number>>} { statName: potentialValue }
     */
    static async rollAllPotentialsFromTemps(stats, actor) {
        const results = [];
        const potentials = {};

        for (const [statName, tempValue] of Object.entries(stats)) {
            const formula = this.getRollFormulaForPotential(tempValue);
            let potential = tempValue;
            let rollResult = "-";

            if (formula) {
                const roll = new Roll(formula);
                await roll.evaluate();
                potential = roll.total < tempValue ? tempValue : roll.total;
                rollResult = roll.result;
            }

            potentials[statName] = potential;
            results.push({
                statName,
                label: game.i18n.localize(`rmss.player_character.attribute.${statName}`) || statName,
                temp: tempValue,
                roll: rollResult,
                potential
            });
        }

        const rows = results.map(r =>
            `<tr style="border-bottom: 1px solid #e0e0e0;"><td style="padding: 4px 8px;">${r.label}</td><td style="text-align: center; padding: 4px 8px;">${r.temp}</td><td style="text-align: center; padding: 4px 8px;">${r.roll}</td><td style="text-align: center; padding: 4px 8px;"><strong>${r.potential}</strong></td></tr>`
        ).join("");

        const actorName = actor?.name || "";
        const actorImg = actor?.img || "";

        const content = `
            <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                ${actorImg ? `<img src="${actorImg}" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" />` : ""}
                <div>
                  <p style="color: #333; font-size: 16px; margin: 0;">
                    <b>${game.i18n.localize("rmss.chat.potential_rolls_title")}</b>
                  </p>
                  ${actorName ? `<p style="color: #555; font-size: 14px; margin: 4px 0 0 0;">${actorName}</p>` : ""}
                </div>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="border-bottom: 1px solid #ccc;">
                    <th style="text-align: left; padding: 4px 8px;">${game.i18n.localize("rmss.chat.potential_rolls_stat")}</th>
                    <th style="text-align: center; padding: 4px 8px;">${game.i18n.localize("rmss.chat.potential_rolls_temp")}</th>
                    <th style="text-align: center; padding: 4px 8px;">${game.i18n.localize("rmss.chat.potential_rolls_roll")}</th>
                    <th style="text-align: center; padding: 4px 8px;">${game.i18n.localize("rmss.chat.potential_rolls_potential")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
        `;

        await ChatMessage.create({
            user: game.user.id,
            speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
            content
        });

        return potentials;
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

        const statName = potentialInput?.name?.match(/stats\.(\w+)\.potential/)?.[1] || "";
        const finalValue = await this.rollPotentialFromTemp(inputValue, statName, actor);
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
