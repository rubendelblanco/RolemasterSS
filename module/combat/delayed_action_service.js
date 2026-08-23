/**
 * Schedule a macro-style command to run automatically N rounds in the future,
 * tied to actual combat round progression (not wall-clock time) — for spells
 * with a casting delay (e.g. a 2-round summon: mark the spot on round 1, the
 * creature appears when round 2 begins).
 *
 * Pending actions are stored on the Combat document itself (flags.rmss.pendingActions),
 * so they survive a page reload/disconnect and are cleaned up automatically when the
 * encounter ends (a new Combat starts with no flags).
 */

const FLAG_SCOPE = "rmss";
const FLAG_KEY = "pendingActions";

/**
 * @param {Combat} combat
 * @returns {Array<{id: string, triggerRound: number, command: string, context: object}>}
 */
function getPending(combat) {
    return foundry.utils.duplicate(combat.getFlag(FLAG_SCOPE, FLAG_KEY) ?? []);
}

/**
 * Schedule `command` to run once combat.round reaches the trigger round.
 * @param {object} options
 * @param {Combat} [options.combat] - defaults to game.combat
 * @param {number} [options.roundsFromNow=1] - fire this many rounds from the current one (ignored if atRound is given)
 * @param {number} [options.atRound] - fire at this exact absolute round number instead
 * @param {string} options.command - JS code to run (async function body). `context`, `combat`
 *   are passed in as arguments; `game`/`canvas`/`ui`/etc. are available as usual globals, same
 *   as any other macro.
 * @param {object} [options.context={}] - plain-data (JSON-serializable) context passed into the command
 * @returns {Promise<string>} the pending action's id (pass to cancelDelayedAction to cancel it)
 */
export async function scheduleDelayedAction({ combat = game.combat, roundsFromNow = 1, atRound, command, context = {} }) {
    if (!combat) throw new Error("scheduleDelayedAction: no active combat to schedule against.");
    if (!command?.trim()) throw new Error("scheduleDelayedAction: command is required.");

    const triggerRound = Number.isFinite(atRound) ? atRound : combat.round + roundsFromNow;
    const id = foundry.utils.randomID();

    const pending = getPending(combat);
    pending.push({ id, triggerRound, command, context });
    await combat.setFlag(FLAG_SCOPE, FLAG_KEY, pending);

    return id;
}

/**
 * Cancel a previously scheduled action (e.g. the caster was interrupted/killed before it fired).
 * @param {Combat} combat
 * @param {string} id
 */
export async function cancelDelayedAction(combat, id) {
    const pending = getPending(combat).filter((p) => p.id !== id);
    await combat.setFlag(FLAG_SCOPE, FLAG_KEY, pending);
}

/**
 * Run (and remove) any pending actions whose trigger round has arrived.
 * @param {Combat} combat
 */
async function runDuePendingActions(combat) {
    const pending = getPending(combat);
    if (pending.length === 0) return;

    const due = pending.filter((p) => combat.round >= p.triggerRound);
    if (due.length === 0) return;

    const remaining = pending.filter((p) => combat.round < p.triggerRound);
    await combat.setFlag(FLAG_SCOPE, FLAG_KEY, remaining);

    for (const action of due) {
        try {
            const AsyncFunction = Object.getPrototypeOf(async function () {}).constructor;
            const fn = new AsyncFunction("context", "combat", action.command);
            await fn(action.context, combat);
        } catch (err) {
            console.error("rmss | delayed action failed", err, action);
            ui.notifications.error(`RMSS: error al ejecutar una acción retardada (${action.id}). Revisa la consola.`);
        }
    }
}

export function registerDelayedActionHooks() {
    Hooks.on("updateCombat", async (combat, changed) => {
        if (!game.user.isGM) return;
        if (!("round" in changed)) return; // only on round transitions
        await runDuePendingActions(combat);
    });
}
