/**
 * Applies an ActiveEffect to other actors on behalf of a player. A player cannot create embedded documents on an actor
 * they do not own, so the player's client asks a GM client to do it (see the "applyEffectsAsGM" socketlib handler in rmss.js).
 * The handler only creates/replaces the effect: radius, targets and visuals stay with whoever calls it.
 */
export const EFFECT_KEY_FLAG = "effectKey";

export default class EffectApplyService {

  /**
   * GM-only. On each actor, removes the effects stamped with `replaceKey` (if any) and creates `effectData`,
   * stamped with that same key so the next call can replace it.
   * @param {{ actorUuids: string[], effectData: object, replaceKey?: string }} payload
   * @returns {Promise<{ applied: string[], failed: string[] }>} actor uuids by outcome
   */
  static async applyEffectsAsGM(payload) {
    const result = { applied: [], failed: [] };
    if (!game.user.isGM) return result;

    const { actorUuids, effectData, replaceKey } = payload ?? {};
    if (!Array.isArray(actorUuids) || !actorUuids.length) return result;
    if (!effectData || typeof effectData !== "object" || typeof effectData.name !== "string" || !effectData.name) {
      result.failed.push(...actorUuids);
      return result;
    }
    for (const uuid of actorUuids) {
      const actor = await EffectApplyService.#resolveActor(uuid);
      if (!actor) {
        result.failed.push(uuid);
        continue;
      }
      try {
        await EffectApplyService.applyToActor(actor, effectData, replaceKey);
        result.applied.push(uuid);
      } catch (e) {
        console.error("rmss | applyEffectsAsGM", uuid, e);
        result.failed.push(uuid);
      }
    }
    return result;
  }

  /**
   * Puts the effect on one actor. With `replaceKey`, the effects of that actor stamped with the same key are removed first and
   * the new one is stamped with it, so asking again replaces instead of stacking. The data given is not modified.
   * The caller must be able to write to the actor (a GM, or its owner).
   * @param {Actor} actor
   * @param {object} effectData
   * @param {string} [replaceKey]
   */
  static async applyToActor(actor, effectData, replaceKey) {
    const key = typeof replaceKey === "string" && replaceKey ? replaceKey : null;
    const data = foundry.utils.deepClone(effectData);
    if (key) {
      data.flags ??= {};
      data.flags.rmss = { ...(data.flags.rmss ?? {}), [EFFECT_KEY_FLAG]: key };
      const old = actor.effects.filter((e) => e.getFlag("rmss", EFFECT_KEY_FLAG) === key).map((e) => e.id);
      if (old.length) await actor.deleteEmbeddedDocuments("ActiveEffect", old);
    }
    await actor.createEmbeddedDocuments("ActiveEffect", [data]);
  }

  /**
   * @param {string} uuid an Actor or a TokenDocument
   * @returns {Promise<Actor|null>}
   */
  static async #resolveActor(uuid) {
    if (typeof uuid !== "string" || !uuid) return null;
    const doc = await fromUuid(uuid);
    if (!doc) return null;
    return doc.documentName === "Actor" ? doc : (doc.actor ?? null);
  }
}
