/**
 * Auto-append a magic bonus to an item's display name so a GM doesn't have to
 * hand-type "Broadsword +5" every time — save with the bonus set and it's added
 * (or updated/removed) automatically. Any previously-appended suffix is stripped
 * before recomputing, so bumping the bonus never stacks duplicate suffixes.
 *
 * The suffix formats are distinctive on purpose (bare " +N" for weapon/armor,
 * " +N (Skill)" for a single bonus_skills entry) so stripping them back off is
 * safe and won't eat into a legitimate name that happens to end similarly.
 */

const WEAPON_ARMOR_SUFFIX_RE = /\s+[+-]\d+$/;
const ITEM_SUFFIX_RE = /\s+[+-]\d+\s+\([^)]*\)$/;

function formatSigned(n) {
  return n >= 0 ? `+${n}` : `${n}`;
}

/**
 * @param {string} currentName - the name as submitted/stored (may already carry a suffix)
 * @param {number} bonus - system.bonus after form normalization
 * @returns {string} recomputed name
 */
export function computeWeaponArmorAutoName(currentName, bonus) {
  const base = String(currentName ?? "").replace(WEAPON_ARMOR_SUFFIX_RE, "").trimEnd();
  const n = Number(bonus) || 0;
  return n !== 0 ? `${base} ${formatSigned(n)}` : base;
}

/**
 * Only auto-names when there's exactly one bonus_skills entry with a non-zero
 * bonus — with several bonuses (or none) at once, the object should already
 * have its own proper name, so the current name is returned unchanged.
 * @param {string} currentName
 * @param {Array<{skill_name?: string, skill?: string, bonus?: number}>} bonusSkillsList
 * @returns {string}
 */
export function computeItemAutoName(currentName, bonusSkillsList) {
  const base = String(currentName ?? "").replace(ITEM_SUFFIX_RE, "").trimEnd();
  const list = Array.isArray(bonusSkillsList) ? bonusSkillsList : [];
  if (list.length !== 1) return base;

  const entry = list[0];
  const n = Number(entry?.bonus) || 0;
  if (n === 0) return base;

  const skillLabel = (entry?.skill_name || entry?.skill || "").trim();
  if (!skillLabel) return base;

  return `${base} ${formatSigned(n)} (${skillLabel})`;
}
