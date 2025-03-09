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

    static calculateKillExpPoints(opponentLevel, killerLevel) {
        let expPoints;

        if (opponentLevel === 0) {
            expPoints = (50 - (killerLevel*5)) + 5;
            return expPoints;
        }

        const diff = opponentLevel - killerLevel;

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

        return expPoints;
    }

    static calculateBonusExpPoints(attackerLevel, code) {
        let expPoints;

        const table = [
            {
                a: 50,
                b: 75,
                c: 100,
                d: 200,
                e: 400,
                f: 800,
                g: 1200,
                h: 1600,
                i: 2000,
                j: 3000,
                k: 4000,
                l: 5000,
            },
            {
                a: 40,
                b: 60,
                c: 95,
                d: 190,
                e: 380,
                f: 760,
                g: 1140,
                h: 1520,
                i: 1900,
                j: 2850,
                k: 3800,
                l: 4750,
            },
        ];

        const inc = {
            a: 10,
            b: 10,
            c: 5,
            d: 10,
            e: 20,
            f: 40,
            g: 60,
            h: 80,
            i: 100,
            j: 150,
            k: 200,
            l: 250,
        };

        if (!table[0][code]) {
            return 0;
        }

        if (attackerLevel === 1 || attackerLevel === 2) {
            expPoints = table[0][code];
        } else if (attackerLevel === 3 || attackerLevel === 4) {
            expPoints = table[1][code]
        } else {
            const row = Math.ceil(attackerLevel / 2);
            expPoints = Math.max(
                table[table.length - 1][code] - (row - table.length) * inc[code],
                0
            );
        }

        return expPoints;
    }

    static calculateCriticalExpPoints(criticalLevel, opponentLevel) {
        const critical = ExperiencePointsCalculator.data.criticalExpPoints[criticalLevel];
        return (critical * 5 * opponentLevel);
    }

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
            await LevelUpManager.levelUp(actor)
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
            html.find('.maneuver-exp-total').text(expPoints);
            calculateTotalExpPoints();
        })

        function calculateSpellExpPoints() {
            const spellLevel = parseInt(html.find("#spell-level-exp").val());
            const spellCaster = parseInt(html.find("#spell-level-caster").val());
            let expPoints;

            if (isNaN(spellCaster) || spellCaster === null || isNaN(spellLevel) || spellLevel === null) {
                expPoints = 0;
                console.log("PIFIA AQUI");
            } else {
                expPoints = 100 - (10 * (spellCaster - spellLevel));

                if (expPoints > 200) {
                    expPoints = 200;
                } else if (expPoints < 0) {
                    expPoints = 0;
                }
            }

            if (!isNaN(expPoints)) {
                html.find('.spell-exp-total').text(expPoints);
            }
            else{
                html.find('.spell-exp-total').text(0);
            }

            calculateTotalExpPoints();
        }

        html.find("#spell-level-exp").change(calculateSpellExpPoints);
        html.find("#spell-level-caster").change(calculateSpellExpPoints);

        function getCriticalExpPoints(){
            const criticalLevel = html.find("#critical-level-exp").val();
            const opponentLevel = parseInt(html.find("#opponent-level").val());
            let expPoints = 0;

            if (criticalLevel !== null && opponentLevel !== null) {
                expPoints = ExperiencePointsCalculator.calculateCriticalExpPoints(criticalLevel, opponentLevel);
            }

            if (!isNaN(expPoints)) {
                html.find('.critical-exp-total').text(expPoints);
            }
            else {
                html.find('.critical-exp-total').text(0);
            }

            calculateTotalExpPoints();
        }

        html.find("#critical-level-exp").change(getCriticalExpPoints);
        html.find("#opponent-level").change(getCriticalExpPoints);

        function getKillExpPoints(){
            const opponentLevel = parseInt(html.find("#kill-opponent-level").val());
            const killerLevel = parseInt(html.find("#killer-character-level").val());
            let expPoints = 0;

            if (killerLevel !== null && opponentLevel !== null) {
                expPoints = ExperiencePointsCalculator.calculateKillExpPoints (opponentLevel, killerLevel);
            }

            if (!isNaN(expPoints)) {
                html.find('.kill-exp-total').text(expPoints);
            }
            else {
                html.find('.kill-exp-total').text(0);
            }

            calculateTotalExpPoints();
        }

        html.find("#kill-opponent-level").change(getKillExpPoints);
        html.find("#killer-character-level").change(getKillExpPoints);

        function getBonusExpPoints(){
            const bonusAttackerLevel = parseInt(html.find("#bonus-attacker-level").val());
            const bonusCode = html.find("#bonus-code").val();
            let expPoints = 0;

            console.log(bonusAttackerLevel);
            console.log(bonusCode);

            if (bonusAttackerLevel !== null && bonusCode !== null) {
                expPoints = ExperiencePointsCalculator.calculateBonusExpPoints(bonusAttackerLevel, bonusCode);
            }

            if (!isNaN(expPoints)) {
                html.find('.bonus-exp-total').text(expPoints);
            }
            else{
                html.find('.bonus-exp-total').text(0);
            }
            calculateTotalExpPoints();
        }

        html.find("#bonus-attacker-level").change(getBonusExpPoints);
        html.find("#bonus-code").change(getBonusExpPoints);
        html.find("#misc-exp-points").change(ev => {
            html.find('.misc-exp-total').text(ev.currentTarget.value);
            calculateTotalExpPoints();
        })

        function calculateTotalExpPoints() {
            const maneuver = parseInt(html.find('.maneuver-exp-total').text());
            const spell = parseInt(html.find('.spell-exp-total').text());
            const critical = parseInt(html.find('.critical-exp-total').text());
            const kill = parseInt(html.find('.kill-exp-total').text());
            const bonus = parseInt(html.find('.bonus-exp-total').text());
            const misc = parseInt(html.find('.misc-exp-total').text());
            const totalExp = maneuver+spell+critical+kill+bonus+misc;
            html.find('.exp-total').text(totalExp);
        }

        html.find("#add-exp").click(async ev => {
            const totalExp = parseInt(html.find('.exp-total').text().trim(), 10);
            actor.system.attributes.experience_points.value += parseInt(totalExp);
            let totalExpActor = parseInt(actor.system.attributes.experience_points.value);

            if (isNaN(totalExpActor)) {
                ui.notifications.error("Experience calculation error.");
                return;
            }
            await actor.update({"system.attributes.experience_points.value": totalExpActor});
        })

        html.find("#reset-exp").click(async ev => {
            if (actor.sheet) {
                actor.sheet.render(true);
            }
        });
    }
}