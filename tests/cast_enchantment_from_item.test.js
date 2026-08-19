/**
 * Tests for castEnchantmentFromItem: a one-shot potion (usage "single" + "potion" tag) must
 * only be consumed when the underlying spell actually got cast. Before this fix, any of the
 * four cast services (BE, DE, Force, Instant) that aborted early — e.g. a BE ball spell with
 * no area template placed yet, a cancelled casting-options dialog, insufficient PP — still
 * consumed the potion, because none of them reported success/failure back to the caller.
 */
import { jest } from '@jest/globals';
import { castEnchantmentFromItem } from '../module/sheets/items/cast_enchantment_from_item.js';
import BaseElementalSpellService from '../module/spells/services/base_elemental_spell_service.js';
import InstantSpellService from '../module/spells/services/instant_spell_service.js';
import DirectedElementalSpellService from '../module/spells/services/directed_elemental_spell_service.js';
import ForceSpellService from '../module/spells/services/force_spell_service.js';

function makePotionItem(enchantment, quantity = 1) {
    return {
        system: {
            tags: ["potion"],
            quantity,
            magic: { enchantments: [enchantment] }
        },
        update: jest.fn().mockResolvedValue(undefined),
        delete: jest.fn().mockResolvedValue(undefined)
    };
}

function makeActor() {
    return Object.setPrototypeOf({ system: { fixed_info: {} } }, Actor.prototype);
}

describe('castEnchantmentFromItem: potion consumption gated on the spell actually casting', () => {
    let actor;
    const enchantment = { usage: "single", spellUuid: "Item.fake-fireball", spellListName: "Fireball" };

    beforeEach(() => {
        actor = makeActor();
        global.foundry.utils.duplicate = (obj) => JSON.parse(JSON.stringify(obj));
        global.fromUuid = jest.fn().mockResolvedValue({ type: "spell", system: { type: "BE" } });
        BaseElementalSpellService.castBaseElementalSpell = jest.fn();
        InstantSpellService.castInstantSpell = jest.fn().mockResolvedValue(undefined);
        DirectedElementalSpellService.castDirectedElementalSpell = jest.fn().mockResolvedValue(undefined);
        ForceSpellService.castForceSpell = jest.fn().mockResolvedValue(undefined);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('BE spell aborted (e.g. no area template placed): potion is NOT consumed', async () => {
        BaseElementalSpellService.castBaseElementalSpell.mockResolvedValue(false);
        const item = makePotionItem(enchantment);

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({});
        expect(item.update).not.toHaveBeenCalled();
        expect(item.delete).not.toHaveBeenCalled();
    });

    test('BE spell actually cast: single-use potion (qty 1) is deleted', async () => {
        BaseElementalSpellService.castBaseElementalSpell.mockResolvedValue(true);
        const item = makePotionItem(enchantment, 1);

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({ itemDeleted: true, applied: true });
        expect(item.delete).toHaveBeenCalled();
        expect(item.update).not.toHaveBeenCalled();
    });

    test('BE spell actually cast: stacked potion (qty > 1) decrements quantity instead of deleting', async () => {
        BaseElementalSpellService.castBaseElementalSpell.mockResolvedValue(true);
        const item = makePotionItem(enchantment, 3);

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({ applied: true });
        expect(item.update).toHaveBeenCalledWith({ "system.quantity": 2 });
        expect(item.delete).not.toHaveBeenCalled();
    });

    test('Instant spell cast successfully: potion consumed', async () => {
        global.fromUuid.mockResolvedValue({ type: "spell", system: { instant: true } });
        InstantSpellService.castInstantSpell.mockResolvedValue(true);
        const item = makePotionItem(enchantment, 1);

        await castEnchantmentFromItem(actor, item, 0);

        expect(InstantSpellService.castInstantSpell).toHaveBeenCalled();
        expect(item.delete).toHaveBeenCalled();
    });

    test('Instant spell cancelled/aborted (e.g. insufficient PP): potion NOT consumed', async () => {
        global.fromUuid.mockResolvedValue({ type: "spell", system: { instant: true } });
        InstantSpellService.castInstantSpell.mockResolvedValue(false);
        const item = makePotionItem(enchantment, 1);

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({});
        expect(item.delete).not.toHaveBeenCalled();
    });

    test('DE spell aborted (e.g. no targets selected): potion NOT consumed', async () => {
        global.fromUuid.mockResolvedValue({ type: "spell", system: { type: "DE" } });
        DirectedElementalSpellService.castDirectedElementalSpell.mockResolvedValue(false);
        const item = makePotionItem(enchantment, 1);

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({});
        expect(item.delete).not.toHaveBeenCalled();
    });

    test('Force spell committed (dialog confirmed, dice rolled): potion consumed even on a spell failure', async () => {
        global.fromUuid.mockResolvedValue({ type: "spell", system: { type: "F" } });
        ForceSpellService.castForceSpell.mockResolvedValue(true);
        const item = makePotionItem(enchantment, 1);

        await castEnchantmentFromItem(actor, item, 0);

        expect(ForceSpellService.castForceSpell).toHaveBeenCalled();
        expect(item.delete).toHaveBeenCalled();
    });

    test('Force spell cancelled at the casting-options dialog: potion NOT consumed', async () => {
        global.fromUuid.mockResolvedValue({ type: "spell", system: { type: "F" } });
        ForceSpellService.castForceSpell.mockResolvedValue(false);
        const item = makePotionItem(enchantment, 1);

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({});
        expect(item.delete).not.toHaveBeenCalled();
    });
});
