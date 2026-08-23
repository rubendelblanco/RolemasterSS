/**
 * Persist a flags.rmss.<key> change on an Item, safely handling the temp "bridge" item used
 * to edit a spell still embedded in a spell_list's system.spells array (see
 * rmss_spell_list_sheet.js). That item is created with {temporary: true} and was never
 * actually persisted, so a normal item.update()/item.setFlag() on it can trip Foundry's
 * document-array validation ("You must provide an _id for every object in the update data
 * Array"). For that case, update the item's data locally (updateSource never hits the
 * database) and sync the change directly into the parent spell list's stored spell entry.
 * For a normal (non-bridge) item, this is just setFlag/unsetFlag as usual.
 * @param {Item} item
 * @param {string} key - the flag key under "rmss" (e.g. "macro")
 * @param {*} [value] - the new value, or undefined to remove the flag
 */
export async function persistItemRmssFlag(item, key, value) {
    const editCtx = item.getFlag("rmss", "embeddedSpellEdit");
    if (!editCtx) {
        if (value === undefined) await item.unsetFlag("rmss", key);
        else await item.setFlag("rmss", key, value);
        return;
    }

    if (value === undefined) await item.updateSource({ [`flags.rmss.-=${key}`]: null });
    else await item.updateSource({ [`flags.rmss.${key}`]: value });

    const spellList = await fromUuid(editCtx.spellListUuid);
    if (!spellList) return;
    const spells = [...(spellList.system.spells ?? [])];
    const i = Number(editCtx.spellIndex);
    if (!Number.isFinite(i) || i < 0 || i >= spells.length) return;

    const spell = foundry.utils.duplicate(spells[i]);
    spell.flags = spell.flags ?? {};
    spell.flags.rmss = spell.flags.rmss ?? {};
    if (value === undefined) delete spell.flags.rmss[key];
    else spell.flags.rmss[key] = value;
    spells[i] = spell;

    await spellList.update({ "system.spells": spells });
    if (spellList.sheet?.rendered) spellList.sheet.render(false);
}
