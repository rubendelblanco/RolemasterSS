/** Fixed slugs for hits/PP sync (from CONFIG.rmss.skill_categories). */
const BODY_DEVELOPMENT_SLUG = "body-development";
const POWER_POINT_DEVELOPMENT_SLUG = "power-point-development";

/**
 * Syncs actor's hits.max and power_points.max from Body Development and Power Point Development skills.
 * Uses prepared data so Active Effects and stat changes are reflected correctly.
 * Categories are found by slug (fixed) for robustness (names can be translated).
 * @param {Actor} actor - The actor to sync.
 * @returns {Promise<void>}
 */
export async function syncHitsAndPowerPointsFromSkills(actor) {
  if (!actor) return;

  actor.prepareData();

  const bodyDevCategory = actor.items.find(
    (i) => i.type === "skill_category" && i.system?.slug === BODY_DEVELOPMENT_SLUG
  );
  const ppDevCategory = actor.items.find(
    (i) => i.type === "skill_category" && i.system?.slug === POWER_POINT_DEVELOPMENT_SLUG
  );

  const updates = {};

  if (bodyDevCategory) {
    const bodySkills = actor.items.filter(
      (i) => i.type === "skill" && i.system?.category === bodyDevCategory.id
    );
    const hitsMax = bodySkills.length > 0
      ? Math.max(...bodySkills.map((s) => Number(s.system?.total_bonus ?? 0)))
      : 0;
    const currentHits = Number(actor.system?.attributes?.hits?.max ?? 0);
    if (hitsMax !== currentHits) {
      updates["system.attributes.hits.max"] = hitsMax;
    }
  }

  if (ppDevCategory) {
    const ppSkills = actor.items.filter(
      (i) => i.type === "skill" && i.system?.category === ppDevCategory.id
    );
    const ppMax = ppSkills.length > 0
      ? Math.max(...ppSkills.map((s) => Number(s.system?.total_bonus ?? 0)))
      : 0;
    const currentPP = Number(actor.system?.attributes?.power_points?.max ?? 0);
    if (ppMax !== currentPP) {
      updates["system.attributes.power_points.max"] = ppMax;
    }
  }

  if (Object.keys(updates).length > 0) {
    await actor.update(updates);
  }
}
