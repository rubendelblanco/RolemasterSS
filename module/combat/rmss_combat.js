import {RMSSCombatant} from "./rmss_combatant.js";
import { registerCombatHooks } from "./hooks.js";
import { CombatHistoryTracker } from "./combat_history_tracker.js";

/**
 * Custom Combat class for RMSS system.
 *
 * NOTE: Due to known issues with ActiveEffect handling in Foundry VTT version 12,
 * specifically with automatic round-based duration decrementing, this class
 * implements custom logic in `nextRound` to manually manage effect durations.
 *
 * In version 12, ActiveEffect duration fields (e.g., rounds) do not reliably decrement
 * or expire at the end of each round when expected, especially in systems outside of
 * the official D&D 5E system. As a result, effects relying on round-based expiry can
 * persist indefinitely, even when they should have expired.
 *
 * This implementation of `nextRound` iterates over each combatant's active effects and
 * manually decrements round-based durations. When an effect reaches zero rounds, it is
 * removed from the actor. This custom solution ensures that effects with round-based
 * durations expire correctly in each new combat round.
 */
export class RMSSCombat extends Combat {
    constructor(data, context) {
        super(data, context);
    }

    /** @override */
    _createCombatant(data, initData) {
        // Use RMSSCombatant instead Combatant
        return new RMSSCombatant(data, this, initData);
    }

    async _decreaseRoundsEffect(effect){
        const duration = effect.duration;

        if (duration.rounds) {
            const remainingRounds = duration.rounds - 1;

            if (remainingRounds <= 0) {
                await effect.delete();
            } else {
                await effect.update({"duration.rounds": remainingRounds});
            }
        }
    }

    /** @override */
    async nextTurn() {
        return super.nextTurn();
    }

    /** @override */
    async nextRound(){
        super.nextRound();

        for (let combatant of this.combatants) {
            const actor = combatant.actor;
            if (!actor) continue;
            const permanentEffects = ["Bleeding", "Penalty"];
            let effectsAlreadyErased = {"Stunned": false, "No parry": false, "Parry": false};

            for (let effect of [...actor.effects]) {
                if (effect.name === "Bleeding") {
                    actor.system.attributes.hits.current -= effect.flags.rmss.value;
                }

                if (permanentEffects.includes(effect.name) || (effectsAlreadyErased.hasOwnProperty(effect.name) && effectsAlreadyErased[effect.name])) {
                    continue;
                }

                await this._decreaseRoundsEffect(effect);

                //only erase one effect per round
                if (effectsAlreadyErased.hasOwnProperty(effect.name)) {
                    effectsAlreadyErased[effect.name] = true;
                }
            }
        }
    }

    async rollInitiative(ids, {formula=null, updateTurn=true}={}) {
        return super.rollInitiative(ids, {formula, updateTurn});
    }

    // Function to get the selected target token based on toggle target state
    static getTargets() {
        // Get the currently selected tokens
        const selectedTokens = canvas.tokens.controlled;

        // Ensure we have exactly one selected token
        if (selectedTokens.length !== 1) {
            ui.notifications.warn("Please select exactly one token as the attacker.");
            return;
        }

        // Find the target token that has the target state toggled on
        const targets = Array.from(game.user.targets);

        // Check if a target is found
        if (!targets) {
            ui.notifications.warn("Please target another token.");
            return;
        }

        return targets;
    }

}

//Singleton for combat start
export class CombatStartManager {
    constructor() {
        if (CombatStartManager.instance) {
            return CombatStartManager.instance;
        }
        this._registerHook();
        CombatStartManager.instance = this;
    }

    _registerHook() {
        if (CombatStartManager.hookRegistered) return;

        Hooks.on("combatStart", (combat) => this.handleCombatStart(combat));
        registerCombatHooks();
        CombatStartManager.hookRegistered = true;
    }

    handleCombatStart(combat) {
        CombatHistoryTracker.get().onCombatStart(combat);
        this.playCombatSound();
        this.showCombatImage();
    }

    playCombatSound(combat) {
        // Define the base directory path
        const basePath = CONFIG.rmss.paths.sounds_folder+"combat/begin_combat/";
        // Create an array with only the filenames
        const soundFiles = [
            "begin_combat_1.mp3",
            "begin_combat_2.mp3",
            "begin_combat_3.mp3",
            "begin_combat_4.mp3",
            "begin_combat_5.ogg"
        ];
        // Randomly select a sound from the array
        const randomIndex = Math.floor(Math.random() * soundFiles.length);
        const randomSound = soundFiles[randomIndex];

        foundry.audio.AudioHelper.play({ src: basePath + randomSound, volume: 0.8, loop: false, singleton: true }, true);
    }

    showCombatImage() {
        const imageDiv = document.createElement("div");
        imageDiv.id = "combat-image-overlay";
        imageDiv.style.position = "absolute";
        imageDiv.style.top = "50%";
        imageDiv.style.left = "50%";
        imageDiv.style.transform = "translate(-50%, -50%)";
        imageDiv.style.zIndex = "10000";
        imageDiv.style.border = "0";
        imageDiv.style.transition = "opacity 2s ease";

        // Add image
        const image = document.createElement("img");
        image.src = CONFIG.rmss.paths.images_folder+"logo_swords.png"
        image.style.width = "400px";
        image.style.height = "auto";
        image.style.border = "none";

        // Añadir la imagen al div y el div al cuerpo del documento
        imageDiv.appendChild(image);
        document.body.appendChild(imageDiv);

        // Desvanecer la imagen después de 5 segundos
        setTimeout(() => {
            imageDiv.style.opacity = "0";
            setTimeout(() => {
                document.body.removeChild(imageDiv);
            }, 2000);
        }, 3000);
    }
}

//Singleton for combat end
export class CombatEndManager {
    constructor() {
        if (CombatEndManager.instance) {
            return CombatEndManager.instance;
        }
        this._registerHook();
        CombatEndManager.instance = this;
    }

    _registerHook() {
        if (!CombatEndManager.hookRegistered) {
            Hooks.on("deleteCombat", (combat) => this.handleCombatEnd(combat));
            CombatEndManager.hookRegistered = true;
        }
    }

    async handleCombatEnd(combat) {
        this.playCombatEndSound();
        await this._showCombatHistory(combat);
    }

    async _showCombatHistory(combat) {
        const tracker = CombatHistoryTracker.get();
        const statsMap = tracker.getAndClearStats(combat.id);
        const pcCombatants = combat.combatants.filter(c => c.actor?.type === "character");
        if (pcCombatants.length === 0) return;

        const rounds = combat.round ?? 0;
        const defeatedMap = {};
        (combat.combatants || [])
            .filter(c => c.defeated && c.actor?.type !== "character")
            .forEach(c => {
                const name = c.actor?.name ?? c.name ?? "?";
                if (!defeatedMap[name]) defeatedMap[name] = { name, count: 0, img: c.actor?.img };
                defeatedMap[name].count += 1;
            });
        const defeatedEnemies = Object.values(defeatedMap).map(d =>
            ({ ...d, label: d.count > 1 ? `${d.name} (×${d.count})` : d.name }));

        const defaultStats = () => ({
            critsInflicted: 0, critsReceived: 0, hpInflicted: 0, hpReceived: 0, kills: 0,
            hpByDefender: {}, hpFromAttacker: {}, critsBySeverityInflicted: {}, critsBySeverityReceived: {}, killsList: [],
            spellsCast: 0, ppSpent: 0, spellXpGained: 0
        });

        const formatCritsBySeverity = (sevMap) => {
            if (!sevMap || Object.keys(sevMap).length === 0) return "—";
            return ["A", "B", "C", "D", "E"].filter(s => sevMap[s]).map(s => `${s}:${sevMap[s]}`).join(" ");
        };

        const rows = [];
        for (const combatant of pcCombatants) {
            const actorId = combatant.actor?.id;
            if (!actorId) continue;
            const stats = statsMap.get(actorId) || defaultStats();
            const killsWithData = (stats.killsList || []).map(k => ({
                ...k,
                attackerName: game.actors.get(k.attackerId)?.name ?? "?",
                defenderImg: game.actors.get(k.defenderId)?.img
            }));
            const killsGrouped = [];
            const killsKey = (k) => `${k.defenderName}|${k.attackerName}`;
            const killsMap = {};
            killsWithData.forEach(k => {
                const key = killsKey(k);
                if (!killsMap[key]) {
                    killsMap[key] = { defenderName: k.defenderName, defenderImg: k.defenderImg, attackerName: k.attackerName, count: 0 };
                    killsGrouped.push(killsMap[key]);
                }
                killsMap[key].count += 1;
            });
            killsGrouped.forEach(g => {
                const by = g.attackerName ? ` (${g.attackerName})` : "";
                g.tooltip = g.count > 1 ? `${g.count}× ${g.defenderName}${by}` : `${g.defenderName}${by}`;
                g.countBadge = g.count > 1 ? `×${g.count}` : null;
            });
            const spellsCast = stats.spellsCast || 0;
            const spellsLabel = spellsCast > 0
                ? `${spellsCast} (${stats.ppSpent || 0} PP / ${stats.spellXpGained || 0} XP)`
                : "—";

            rows.push({
                name: combatant.actor?.name ?? combatant.name ?? "—",
                img: combatant.actor?.img ?? null,
                critsInflicted: stats.critsInflicted,
                critsReceived: stats.critsReceived,
                hpInflicted: stats.hpInflicted,
                hpReceived: stats.hpReceived,
                kills: stats.kills,
                critsInflictedBySev: formatCritsBySeverity(stats.critsBySeverityInflicted),
                critsReceivedBySev: formatCritsBySeverity(stats.critsBySeverityReceived),
                killsGrouped,
                spellsLabel
            });
        }

        const html = await renderTemplate("systems/rmss/templates/combat/combat-history-dialog.hbs", {
            rows,
            rounds,
            defeatedEnemies
        });
        const d = new Dialog({
            title: game.i18n.localize("rmss.combat.history.title"),
            content: html,
            default: "ok",
            buttons: { ok: { icon: "<i class='fas fa-check'></i>", label: game.i18n.localize("rmss.combat.history.close") } }
        }, { width: 800, resizable: true });
        await d.render(true);
    }

    playCombatEndSound() {
        // Define the exact path to the end combat sound
        const soundPath = CONFIG.rmss.paths.sounds_folder+"combat/end_combat.ogg";

        // Play the sound once, no loop
        foundry.audio.AudioHelper.play({
            src: soundPath,
            volume: 0.8,
            loop: false,
            singleton: true
        }, true);
    }
}

