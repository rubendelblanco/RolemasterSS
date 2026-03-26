import { socket } from "../../../rmss.js";

/**
 * Heal hit points on targeted token(s) via GM socket (players cannot update other actors directly).
 * Macros should select targets with Foundry's target picker, then call {@link applyHealHits}.
 */
export default class SpellHealService {
    /**
     * Request HP healing on the current scene's targeted token(s). Runs the actual updates as GM.
     *
     * @param {object} options
     * @param {number} options.amountPerTarget - Hits healed (same for each target). Use 0 for a "fizzle" or narrative-only heal.
     * @param {number} [options.maxTargets=1] - Maximum number of targets allowed (minimum 1). You must select between 1 and this many targets.
     * @param {string[]} [options.tokenIds] - Token document IDs on the active scene. Defaults to {@link game.user.targets}.
     * @param {string} [options.sceneId] - Scene ID (defaults to active canvas scene).
     * @returns {Promise<boolean>} True if the request was sent and GM applied it (socket resolves successfully).
     */
    static async applyHealHits({
        amountPerTarget,
        maxTargets = 1,
        tokenIds = null,
        sceneId = null
    } = {}) {
        const scene = canvas?.scene;
        if (!scene) {
            ui.notifications.warn(game.i18n.localize("rmss.spell_heal.no_scene"));
            return false;
        }

        const cap = Math.max(1, Math.floor(Number(maxTargets)));
        const ids =
            tokenIds != null
                ? [...tokenIds]
                : Array.from(game.user.targets).map((t) => t.id);

        if (ids.length < 1 || ids.length > cap) {
            ui.notifications.warn(
                game.i18n.format("rmss.spell_heal.wrong_target_count", {
                    max: cap,
                    actual: ids.length
                })
            );
            return false;
        }

        if (new Set(ids).size !== ids.length) {
            ui.notifications.warn(game.i18n.localize("rmss.spell_heal.duplicate_targets"));
            return false;
        }

        const amt = Math.floor(Number(amountPerTarget));
        if (!Number.isFinite(amt) || amt < 0) {
            ui.notifications.warn(game.i18n.localize("rmss.spell_heal.invalid_amount"));
            return false;
        }

        const sid = sceneId ?? scene.id;
        try {
            await socket.executeAsGM("applySpellHealHits", {
                sceneId: sid,
                tokenIds: ids,
                amountPerTarget: amt,
                requestingUserId: game.user.id
            });
            return true;
        } catch (e) {
            console.error("RMSS applySpellHealHits:", e);
            ui.notifications.error(game.i18n.localize("rmss.spell_heal.socket_failed"));
            return false;
        }
    }

    /**
     * GM-only: apply heal to tokens. Registered as a socketlib handler.
     * @param {{ sceneId: string, tokenIds: string[], amountPerTarget: number, requestingUserId?: string }} payload
     */
    static async applySpellHealHitsGM(payload) {
        if (!game.user.isGM) return;

        const { sceneId, tokenIds, amountPerTarget, requestingUserId: _rid } = payload ?? {};
        const scene = game.scenes.get(sceneId);
        if (!scene) {
            console.warn("RMSS applySpellHealHitsGM: scene not found", sceneId);
            return;
        }

        if (!Array.isArray(tokenIds) || tokenIds.length < 1) return;

        const amt = Math.floor(Number(amountPerTarget));
        if (!Number.isFinite(amt) || amt < 0) return;

        const summaries = [];
        let missing = 0;

        for (const tid of tokenIds) {
            const token = scene.tokens.get(tid);
            const actor = token?.actor;
            if (!actor) {
                missing++;
                continue;
            }

            const hits = actor.system?.attributes?.hits;
            if (!hits) continue;

            const cur = Number(hits.current);
            const current = Number.isFinite(cur) ? cur : 0;
            const maxRaw = Number(hits.max);
            const max = Number.isFinite(maxRaw) ? Math.max(maxRaw, 0) : current;
            const newHits = Math.min(current + amt, max);

            await actor.update({ "system.attributes.hits.current": newHits });

            const recovered = newHits - current;
            if (recovered > 0) {
                summaries.push(
                    game.i18n.format("rmss.spell_heal.notify_healed_line", {
                        name: actor.name,
                        recovered,
                        current: newHits,
                        max
                    })
                );
            }
        }

        if (missing > 0) {
            ui.notifications.warn(game.i18n.localize("rmss.spell_heal.token_not_found"));
        }
        if (summaries.length > 0) {
            ui.notifications.info(summaries.join(game.i18n.localize("rmss.spell_heal.notify_separator")));
        }
    }
}
