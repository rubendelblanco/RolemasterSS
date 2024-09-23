import levelUpManager from "./rmss_level_up_manager.js";
import LevelUpManager from "./rmss_level_up_manager.js";
export default class ExperiencePointsCalculator {
    // JSON object storing experience points for each maneuver type
    static data = {
        maneuverExpPoints: {
            routine: 0,
            easy: 5,
            light: 10,
            medium: 50,
            hard: 100,
            very_hard: 150,
            extremely_hard: 200,
            sheer_folly: 300,
            absurd: 500
        },
        criticalExpPoints: {
            a:1,
            b:2,
            c:3,
            d:4,
            e:5
        }
    };

    static getCharacterLevel(experiencePoints) {
        const experienceTable = [
            { level: 1, experience: 10000 },
            { level: 2, experience: 20000 },
            { level: 3, experience: 30000 },
            { level: 4, experience: 40000 },
            { level: 5, experience: 50000 },
            { level: 6, experience: 70000 },
            { level: 7, experience: 90000 },
            { level: 8, experience: 110000 },
            { level: 9, experience: 130000 },
            { level: 10, experience: 150000 },
            { level: 11, experience: 180000 },
            { level: 12, experience: 210000 },
            { level: 13, experience: 240000 },
            { level: 14, experience: 270000 },
            { level: 15, experience: 300000 },
            { level: 16, experience: 340000 },
            { level: 17, experience: 380000 },
            { level: 18, experience: 420000 },
            { level: 19, experience: 460000 },
            { level: 20, experience: 500000 }
        ];

        // If experience exceeds level 20, calculate additional levels
        const baseExperience = 500000;
        const incrementPerLevel = 50000;

        if (experiencePoints >= baseExperience) {
            return 20 + Math.floor((experiencePoints - baseExperience) / incrementPerLevel);
        }

        // Check for levels 1 through 20
        for (let i = experienceTable.length - 1; i >= 0; i--) {
            if (experiencePoints >= experienceTable[i].experience) {
                return experienceTable[i].level;
            }
        }

        // Default return for experience below level 1
        return 1;
    }

    static loadListeners(html, actor=null){
        //level up button
        html.find("#level-up").click(async(ev) => {
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
                levelUpManager.calculateStatGainRolls(actor);
            }
            else {
                actor.levelUp.isLevelZero = true; //first level. From 0 to 1.
                levelUpManager.calculateDevelopmentPoints(actor);
            }

        })

        html.find("#end-level-up").click(ev => {
            LevelUpManager.endLevelUp(actor);
        });

        //Check character level
        html.find("#experience-points").change(ev => {
            if (!actor) return;
            const experience = parseInt(ev.currentTarget.value);
            const level = parseInt(html.find("#level").val());
            const calcLevel = this.getCharacterLevel(experience);

            if(!actor.system.levelUp.levelAbove) {
                actor.update({system: {'levelUp.levelAbove': calcLevel-level}});
            }

            if (calcLevel > level && (calcLevel-level) > actor.system.levelUp.levelAbove){
                const soundPath = "systems/rmss/assets/sounds/power_up.mp3";
                foundry.audio.AudioHelper.play({ src: soundPath, volume: 0.8, loop: false }).catch(err => {
                    console.error("Sound error:", err);
                });
                ChatMessage.create({
                    content: `
                    <div style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">
                    <img src="systems/rmss/assets/default/level_up.png" alt="Level up" style="width:100px; height:auto; border: 2px solid #333;">
                      <p style="color: #333; font-size: 16px;">
                        <b>${actor.name}</b> sube a <b>nivel ${calcLevel}</b>
                      </p>
                    </div>
                    `,
                    speaker: {
                        alias: "GM"
                    }
                })
                actor.update({system: {'levelUp.levelAbove': calcLevel-level}});
            }
        });

        //Calculate maneuver experience points
        html.find("#maneuver-exp").change(ev => {
            const maneuverType = ev.currentTarget.value.toLowerCase(); // Convert input to lowercase to match JSON keys
            const expPoints = ExperiencePointsCalculator.data.maneuverExpPoints[maneuverType];
            console.log(`Experience Points: ${expPoints}`);
        })

        function calculateSpellExpPoints() {
            const spellLevel = parseInt(html.find("#spell-level-exp").val());
            const spellCaster = parseInt(html.find("#spell-level-caster").val());
            let expPoints;

            if (isNaN(spellCaster) || spellCaster === null || isNaN(spellLevel) || spellLevel === null) {
                expPoints = 0;
            } else {
                expPoints = 100 - (10 * (spellCaster - spellLevel));

                if (expPoints > 200) {
                    expPoints = 200;
                } else if (expPoints < 0) {
                    expPoints = 0;
                }
            }
            console.log(`Experience Points: ${expPoints}`);
        }

        html.find("#spell-level-exp").change(calculateSpellExpPoints);
        html.find("#spell-level-caster").change(calculateSpellExpPoints);

        function calculateCriticalExpPoints() {
            const criticalLevel = html.find("#critical-level-exp").val();
            const opponentLevel = parseInt(html.find("#opponent-level").val());
            const critical = ExperiencePointsCalculator.data.criticalExpPoints[criticalLevel];
            console.log(criticalLevel);
            console.log(opponentLevel);
            console.log(critical);
            const expPoints = (critical * 5 * opponentLevel);

            console.log(`Experience Points: ${expPoints}`);
        }

        html.find("#critical-level-exp").change(calculateCriticalExpPoints);
        html.find("#opponent-level").change(calculateCriticalExpPoints);

        function calculateKillExpPoints() {
            const opponentLevel = parseInt(html.find("#kill-opponent-level").val());
            const killerLevel = parseInt(html.find("#killer-character-level").val());
            const diff = opponentLevel - killerLevel;
            let expPoints;

            if (diff >= 0) {
                expPoints = 200 + (diff * 50);
            } else {
                if (diff === -1) {
                    expPoints = 150;
                } else if (diff === -2 || diff === -3) {
                    expPoints = 150 + ((diff + 1) * 20);
                } else {
                    expPoints = 110 + ((diff + 3) * 10);
                }
            }

            if (expPoints < 0) {
                expPoints = 0;
            }

            console.log(`Experience Points: ${expPoints}`);
        }

        html.find("#kill-opponent-level").change(calculateKillExpPoints);
        html.find("#killer-character-level").change(calculateKillExpPoints);
    }
}