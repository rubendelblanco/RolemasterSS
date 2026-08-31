export default class LevelUpManager {

    static async levelUp(actor){
        const level = parseInt(actor.system.attributes?.level?.value ?? 0);
        if (level === 0) {
            const missing = [];
            if (!actor.system.statAssignment?.completed) {
                missing.push(game.i18n.localize("rmss.level_up.require_stats"));
            }
            const hasProfession = actor.items?.some(i => i.type === "profession") || actor.system.fixed_info?.profession;
            if (!hasProfession) {
                missing.push(game.i18n.localize("rmss.level_up.require_profession"));
            }
            const hasRace = !!actor.system.fixed_info?.race;
            if (!hasRace) {
                missing.push(game.i18n.localize("rmss.level_up.require_race"));
            }
            if (missing.length > 0) {
                ui.notifications.warn(
                    game.i18n.format("rmss.level_up.cannot_level_zero_to_one", { missing: missing.join(", ") })
                );
                return;
            }
        }

        const skills = actor.items.filter(item => item.type === "skill");
        const categories = actor.items.filter(item => item.type === "skill_category");
        const message = game.i18n.localize("rmss.level_up.ranks_reset");
        await actor.update({system:{'levelUp.isLevelingUp': true}})
        const skillUpdates = skills.map(skill => {
            return {
                _id: skill.id,
                'system.new_ranks.value': 0
            };
        });
        const categoryUpdates = categories.map(category => {
            return {
                _id: category.id,
                'system.new_ranks.value': 0
            };
        });
        const updates = [...skillUpdates, ...categoryUpdates];

        if (updates.length > 0) {
            await actor.updateEmbeddedDocuments('Item', updates);
        }

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
                <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${actor.img ? `<img src="${actor.img}" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" />` : ""}
                    <p style="color: #333; font-size: 16px; margin: 0;">
                      <b>${actor.name}</b> ${message}
                    </p>
                  </div>
                </div>`
        });

        if (actor.system.attributes.experience_points.value >=20000){ //just don't do this when we are leveling up from 0 to 1
            await LevelUpManager.calculateStatGainRolls(actor);
        }
        else {
            actor.system.levelUp.isLevelZero = true; //first level. From 0 to 1.
        }
        LevelUpManager.calculateDevelopmentPoints(actor);
        LevelUpManager.chatLevelUpReady(actor);
    }

    // Closing "here's what you can do now" message, shown once all the level-up
    // announcements above have posted.
    static chatLevelUpReady(actor) {
        const actorName = actor?.name || "";
        const actorImg = actor?.img || "";

        ChatMessage.create({
            speaker: ChatMessage.getSpeaker({ actor }),
            content: `
                <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                  <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                    ${actorImg ? `<img src="${actorImg}" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" />` : ""}
                    <p style="color: #333; font-size: 16px; margin: 0;">
                      <b>${actorName}</b> ${game.i18n.localize("rmss.chat.level_up_ready_title")}
                    </p>
                  </div>
                  <p style="color: #333; font-size: 14px; margin: 4px 0;">${game.i18n.localize("rmss.chat.level_up_ready_intro")}</p>
                  <p style="color: #333; font-size: 14px; margin: 4px 0;">
                    <b>${game.i18n.localize("rmss.chat.level_up_ready_option_a")}<br>
                    ${game.i18n.localize("rmss.chat.level_up_ready_option_b")}</b>
                  </p>
                  <p style="color: #333; font-size: 17px; margin: 8px 0 0 0;">${game.i18n.localize("rmss.chat.level_up_ready_footer")}</p>
                </div>`
        });
    }

    //calculate the stat gain as seen on RMSS Core Law page 37
    static _checkTheRolls(actor, rolls, stat){
        let increment;

        if (rolls[0] === rolls[1]) {
            if (rolls[0] <= 5) {
                increment = -rolls[0];
            } else {
                increment = rolls[0] * 2;
            }
        } else {
            let diff = parseInt(stat.potential) - parseInt(stat.temp);
            let higher, lower;

            if (rolls[0] > rolls[1]) {
                higher = rolls[0];
                lower = rolls[1];
            } else {
                higher = rolls[1];
                lower = rolls[0];
            }

            if (diff >= 1 && diff <= 10) {
                increment = lower;
            } else if (diff >= 11 && diff <= 20) {
                increment = higher;
            } else {
                increment = higher + lower;
            }
        }

        stat.temp = stat.temp+increment;
        stat.temp < 0 ? stat.temp = 0 : stat.temp;
        stat.temp > stat.potential ? stat.temp = stat.potential : stat.temp;
        actor.update({ [`system.stats.${stat}.temp`]: stat.temp });
        return {"dice1":rolls[0], "dice2":rolls[1], "inc":increment};
    }

    /**
     * Roll 2d10, apply the gain to stat.temp and persist it. Pure roll+persist step,
     * no chat message - callers decide how to present the result (single card vs. table).
     * @returns {Promise<{dice1:number, dice2:number, inc:number, newTemp:number}>}
     */
    static async _rollAndApplyStatGain(actor, statName, stat) {
        const roll = await new Roll("2d10").roll();
        const results = roll.terms[0].results.map(r => r.result);
        const increment = this._checkTheRolls(actor, results, stat);
        await actor.update({ [`system.stats.${statName}.temp`]: stat.temp });
        return { ...increment, newTemp: stat.temp };
    }

    static async handleStatRoll(actor, statName, stat) {
        const { dice1, dice2, inc, newTemp } = await this._rollAndApplyStatGain(actor, statName, stat);
        const input = document.querySelector(`[name="system.stats.${statName}.temp"]`);
        if (input) input.value = newTemp;

        const statLabel = game.i18n.localize(`rmss.player_character.attribute.${statName}`) || statName;
        const actorName = actor?.name || "";
        const actorImg = actor?.img || "";

        const content = `
            <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 4px;">
                ${actorImg ? `<img src="${actorImg}" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" />` : ""}
                <div>
                  <p style="color: #333; font-size: 16px; margin: 0;">
                    <b>${statLabel}</b> ${game.i18n.format("rmss.chat.stat_gain_result", { value: newTemp, inc })}
                  </p>
                  ${actorName ? `<p style="color: #555; font-size: 14px; margin: 4px 0 0 0;">${actorName}</p>` : ""}
                </div>
              </div>
            </div>
            <div class="dice-tooltip expanded" style="display: block;">
              <section class="tooltip-part">
                <div class="dice">
                  <ol class="dice-rolls">
                    <li class="roll die d10">${dice1}</li>
                    <li class="roll die d10">${dice2}</li>
                  </ol>
                </div>
              </section>
            </div>
          `;

        ChatMessage.create({
            speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
            content
        });
    }

    //Stat gain rolls for the character when level up! One consolidated chat message for all
    //stats instead of one per stat.
    static async calculateStatGainRolls(actor) {
        let stats = actor.system.stats;
        const results = [];

        for (const [statName, stat] of Object.entries(stats)) {
            const expectedProperties = ['shortname', 'temp', 'potential', 'basic_bonus', 'racial_bonus', 'stat_bonus'];
            const hasExpectedProperties = expectedProperties.every(prop => prop in stat);
            //Avoid unexpected assignments
            if (!hasExpectedProperties) continue;

            const { dice1, dice2, inc, newTemp } = await this._rollAndApplyStatGain(actor, statName, stat);
            results.push({
                label: game.i18n.localize(`rmss.player_character.attribute.${statName}`) || statName,
                dice1,
                dice2,
                inc,
                newTemp
            });
        }

        this._chatStatGainRolls(actor, results);
    }

    static _chatStatGainRolls(actor, results) {
        if (results.length === 0) return;

        const rows = results.map(r => {
            const sign = r.inc >= 0 ? "+" : "";
            return `<tr style="border-bottom: 1px solid #e0e0e0;"><td style="padding: 4px 8px;">${r.label}</td><td style="text-align: center; padding: 4px 8px;">${r.dice1} / ${r.dice2}</td><td style="text-align: center; padding: 4px 8px;">${sign}${r.inc}</td><td style="text-align: center; padding: 4px 8px;"><strong>${r.newTemp}</strong></td></tr>`;
        }).join("");

        const actorName = actor?.name || "";
        const actorImg = actor?.img || "";

        const content = `
            <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
              <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 8px;">
                ${actorImg ? `<img src="${actorImg}" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" />` : ""}
                <div>
                  <p style="color: #333; font-size: 16px; margin: 0;">
                    <b>${game.i18n.localize("rmss.chat.stat_gain_rolls_title")}</b>
                  </p>
                  ${actorName ? `<p style="color: #555; font-size: 14px; margin: 4px 0 0 0;">${actorName}</p>` : ""}
                </div>
              </div>
              <table style="width: 100%; border-collapse: collapse; font-size: 14px;">
                <thead>
                  <tr style="border-bottom: 1px solid #ccc;">
                    <th style="text-align: left; padding: 4px 8px;">${game.i18n.localize("rmss.chat.stat_gain_rolls_stat")}</th>
                    <th style="text-align: center; padding: 4px 8px;">${game.i18n.localize("rmss.chat.stat_gain_rolls_dice")}</th>
                    <th style="text-align: center; padding: 4px 8px;">${game.i18n.localize("rmss.chat.stat_gain_rolls_gain")}</th>
                    <th style="text-align: center; padding: 4px 8px;">${game.i18n.localize("rmss.chat.stat_gain_rolls_new_temp")}</th>
                  </tr>
                </thead>
                <tbody>
                  ${rows}
                </tbody>
              </table>
            </div>
        `;

        ChatMessage.create({
            speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
            content
        });
    }

    static calculateDevelopmentPoints(actor) {
        const agilityTemp = actor.system.stats.agility.temp;
        const constitutionTemp = actor.system.stats.constitution.temp;
        const memoryTemp = actor.system.stats.memory.temp;
        const reasoningTemp = actor.system.stats.reasoning.temp;
        const selfDisciplineTemp = actor.system.stats.self_discipline.temp;
        const dps = Math.floor((agilityTemp+constitutionTemp+memoryTemp+reasoningTemp+selfDisciplineTemp)/5);

        actor.system.levelUp.developmentPoints= dps;
        this.chatDevelopmentPoints(actor, dps)
        document.querySelector(`#development-points`).value = dps;
        actor.update({'system.levelUp.developmentPoints': dps});
    }

    static chatDevelopmentPoints(actor, points){
        const actorName = actor?.name || "";
        const actorImg = actor?.img || "";

        ChatMessage.create({
            speaker: actor ? ChatMessage.getSpeaker({ actor }) : ChatMessage.getSpeaker(),
            content: `
                <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                  <div style="display: flex; align-items: center; gap: 10px;">
                    ${actorImg ? `<img src="${actorImg}" style="width: 48px; height: 48px; border-radius: 4px; object-fit: cover;" />` : ""}
                    <div>
                      <p style="color: #333; font-size: 16px; margin: 0;">
                        ${game.i18n.format("rmss.chat.dev_points_remaining", { points })}
                      </p>
                      ${actorName ? `<p style="color: #555; font-size: 14px; margin: 4px 0 0 0;">${actorName}</p>` : ""}
                    </div>
                  </div>
                </div>`
        });
    }

    static endLevelUp(actor) {
        const currentLevel = parseInt(actor.system.attributes.level.value);
        let currentLevelAbove = actor.system.levelUp.levelAbove -=1;

        if (currentLevelAbove < 0) {
            currentLevelAbove = 0;
        }

        actor.update({
            system: {
                'levelUp.levelAbove': currentLevelAbove,
                'attributes.level.value': currentLevel + 1,
                'levelUp.isLevelingUp': false,
                'levelUp.isLevelZero': false,
                'levelUp.developmentPoints': 0
            }
        });

    }
}