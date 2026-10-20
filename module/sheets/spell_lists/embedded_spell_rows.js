/**
 * The rows a spell list sheet shows for the spells stored inside the list (`system.spells`).
 *
 * The sheet shows them sorted by level, but the edit, delete and drag handlers (and the hook that saves an edited spell
 * back into the list) work on the position in the STORED array. If the sorted position were used for those, any list
 * whose stored order is not level-ascending would edit, delete or drag the wrong spell, and saving an edit would overwrite
 * another spell with a copy of the edited one. So every row carries `_idx`, its position in the stored array.
 *
 * Pure function, no Foundry.
 * @param {object[]} spells the stored spells
 * @returns {Array<object & { _idx: number }>} copies of the spells, sorted by level (stable), each with its stored position
 */
export function embeddedSpellRows(spells) {
    return [...(spells ?? [])]
        .map((spell, index) => ({ ...spell, _idx: index }))
        .sort((a, b) => (Number(a.system?.level) || 0) - (Number(b.system?.level) || 0));
}
