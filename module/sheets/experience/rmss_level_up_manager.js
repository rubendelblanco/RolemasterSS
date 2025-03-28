export default class LevelUpManager {

    static async levelUp(actor){
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
            content: `
                <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                  <p style="color: #333; font-size: 16px;">
                  <b>${actor.name}</b> ${message}
                   </p>
                </div>`
        });

        if (actor.system.attributes.experience_points.value >=20000){ //just don't do this when we are leveling up from 0 to 1
            await LevelUpManager.calculateStatGainRolls(actor);
        }
        else {
            actor.system.levelUp.isLevelZero = true; //first level. From 0 to 1.
            LevelUpManager.calculateDevelopmentPoints(actor);
        }
    }

    //Stat gain rolls for the character when level up!
    static async calculateStatGainRolls(actor) {
        let stats = actor.system.stats;
        let increment;

        //calculate the stat gain as seen on RMSS Core Law page 37
        function checkTheRolls(rolls, stat) {
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
            return {"dice1":rolls[0], "dice2":rolls[1], "inc":increment};
        }

        for (const [statName,stat] of Object.entries(stats)) {
            let roll = await new Roll("2d10").roll();
            let results = roll.terms[0].results.map(r => r.result);
            let increment = checkTheRolls(results, stat);
            document.querySelector(`[name="system.stats.${statName}.temp"]`).value = stat.temp;
            ChatMessage.create({
                content: `
                <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                  <p style="color: #333; font-size: 16px;">
                  <b>${statName}</b> vale ahora ${stat.temp} (aumenta ${increment.inc})
                   </p>
                </div>
                   <div class="dice-tooltip expanded" style="display: block;">
                        <section class="tooltip-part">
                            <div class="dice">
                                <ol class="dice-rolls">
                                <li class="roll die d10">${increment.dice1}</li>
                                <li class="roll die d10">${increment.dice2}</li>
                                </ol>
                            </div>
                        </section>
                    </div>`
            });
            this.calculateDevelopmentPoints(actor);
        }
    }

    static calculateDevelopmentPoints(actor) {
        const agilityTemp = actor.system.stats.agility.temp;
        const constitutionTemp = actor.system.stats.constitution.temp;
        const memoryTemp = actor.system.stats.memory.temp;
        const reasoningTemp = actor.system.stats.reasoning.temp;
        const selfDisciplineTemp = actor.system.stats.self_discipline.temp;
        const dps = Math.floor((agilityTemp+constitutionTemp+memoryTemp+reasoningTemp+selfDisciplineTemp)/5);

        actor.system.levelUp.developmentPoints= dps;
        this.chatDevelopmentPoints(dps)
        document.querySelector(`#development-points`).value = dps;
    }

    static chatDevelopmentPoints(points){
        ChatMessage.create({
            content: `
                <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                  <p style="color: #333; font-size: 16px;">
                  Points remaining: <b>${points}</b>
                   </p>
                </div>`
        });
    }

    static endLevelUp(actor) {
        const currentLevel = parseInt(actor.system.attributes.level.value);
        const currentLevelAbove = actor.system.levelUp.levelAbove -=1;
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