/**
 * Expands embedded spells from a spell list's system.spells into actor spell Items.
 * Used when importing a spell list from compendium (profession apply or drag to actor).
 * @param {Actor} actor - The actor owning the spell list
 * @param {Item} spellList - The spell list Item (already on actor)
 * @returns {Promise<number>} Number of spell Items created
 */
import { ContainerHandler } from "../actors/utils/container_handler.js";

const SPELL_DEFAULTS = {
    favorite: false,
    instant: false,
    spell_list: "",
    level: 1,
    area_of_effect: "",
    duration: "",
    range: "",
    type: "U",
    subType: "-",
    attack_table: "",
    skillName: "",
    description: ""
};

export async function expandSpellListEmbeddedSpells(actor, spellList) {
    const embedded = spellList.system?.spells ?? [];
    if (embedded.length === 0) return 0;

    const spellListId = spellList.id ?? spellList._id;
    const spellItems = embedded.map(s => {
        const system = foundry.utils.mergeObject(
            foundry.utils.duplicate(SPELL_DEFAULTS),
            s.system ?? {},
            { inplace: false }
        );
        // Preservar flags del hechizo embebido (p. ej. rmss.macro); solo añadir containerId a la lista.
        const flags = foundry.utils.duplicate(s.flags ?? {});
        if (!flags.rmss) flags.rmss = {};
        flags.rmss.containerId = spellListId;
        return {
            name: s.name ?? game.i18n.localize("rmss.spell.new_spell"),
            type: "spell",
            img: s.img ?? "icons/svg/mystery-man.svg",
            system,
            flags
        };
    });

    await actor.createEmbeddedDocuments("Item", spellItems);

    const handler = ContainerHandler.for(spellList);
    if (handler) await handler.recalc();

    return spellItems.length;
}
