/**
 * Tests for castEnchantmentFromItem: a one-shot potion (usage "single" + "potion" tag) must
 * only be consumed when the underlying spell actually got cast. Before this fix, any of the
 * four cast services (BE, DE, Force, Instant) that aborted early — e.g. a BE ball spell with
 * no area template placed yet, a cancelled casting-options dialog, insufficient PP — still
 * consumed the potion, because none of them reported success/failure back to the caller.
 */
import { jest } from '@jest/globals';
import { castEnchantmentFromItem, itemHasArtifactTag } from '../module/sheets/items/cast_enchantment_from_item.js';
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

function makeArtifactItem(enchantment, chargePool) {
    return {
        system: {
            tags: [],
            magic: { enchantments: [enchantment], chargePool }
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

describe('castEnchantmentFromItem: pooled usage (artifact shared charge pool)', () => {
    let actor;

    beforeEach(() => {
        actor = makeActor();
        global.foundry.utils.duplicate = (obj) => JSON.parse(JSON.stringify(obj));
        global.fromUuid = jest.fn().mockResolvedValue({ type: "spell", system: { type: "BE" } });
        BaseElementalSpellService.castBaseElementalSpell = jest.fn().mockResolvedValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('spends the enchantment\'s poolCost from the item-level pool, not from the enchantment itself', async () => {
        const enchantment = { usage: "pooled", poolCost: 5, spellUuid: "Item.fireball" };
        const item = makeArtifactItem(enchantment, { current: 40, max: 40 });

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({ applied: true });
        expect(item.update).toHaveBeenCalledWith({ "system.magic.chargePool.current": 35 });
        expect(item.delete).not.toHaveBeenCalled();
    });

    test('different enchantments on the same item draw from the same pool at their own cost', async () => {
        const cheapSpell = { usage: "pooled", poolCost: 1, spellUuid: "Item.shield" };
        const item = makeArtifactItem(cheapSpell, { current: 3, max: 40 });

        await castEnchantmentFromItem(actor, item, 0);

        expect(item.update).toHaveBeenCalledWith({ "system.magic.chargePool.current": 2 });
    });

    test('never goes below 0 even if cost exceeds current (defense in depth; UI should already gate this via canUse)', async () => {
        const enchantment = { usage: "pooled", poolCost: 5, spellUuid: "Item.fireball" };
        const item = makeArtifactItem(enchantment, { current: 3, max: 40 });

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({ applied: true });
        expect(item.update).toHaveBeenCalledWith({ "system.magic.chargePool.current": 0 });
    });

    test('poolCost defaults to 1 when missing or invalid', async () => {
        const enchantment = { usage: "pooled", spellUuid: "Item.shield" };
        const item = makeArtifactItem(enchantment, { current: 10, max: 40 });

        await castEnchantmentFromItem(actor, item, 0);

        expect(item.update).toHaveBeenCalledWith({ "system.magic.chargePool.current": 9 });
    });

    test('a cancelled/aborted cast does not touch the pool at all', async () => {
        BaseElementalSpellService.castBaseElementalSpell.mockResolvedValue(false);
        const enchantment = { usage: "pooled", poolCost: 5, spellUuid: "Item.fireball" };
        const item = makeArtifactItem(enchantment, { current: 40, max: 40 });

        const result = await castEnchantmentFromItem(actor, item, 0);

        expect(result).toEqual({});
        expect(item.update).not.toHaveBeenCalled();
    });

    test('the enchantment array itself is untouched by a pooled cast', async () => {
        const enchantment = { usage: "pooled", poolCost: 5, spellUuid: "Item.fireball" };
        const item = makeArtifactItem(enchantment, { current: 40, max: 40 });

        await castEnchantmentFromItem(actor, item, 0);

        const calls = item.update.mock.calls.map((c) => Object.keys(c[0])[0]);
        expect(calls).not.toContain("system.magic.enchantments");
    });
});

describe('itemHasArtifactTag', () => {
    test('true when "artifact" is among system.tags', () => {
        expect(itemHasArtifactTag({ system: { tags: ["artifact"] } })).toBe(true);
        expect(itemHasArtifactTag({ tags: ["clothing", "Artifact"] } )).toBe(true);
    });

    test('false when missing, empty, or not present', () => {
        expect(itemHasArtifactTag({ system: { tags: [] } })).toBe(false);
        expect(itemHasArtifactTag({ system: {} })).toBe(false);
        expect(itemHasArtifactTag({ system: { tags: ["potion"] } })).toBe(false);
        expect(itemHasArtifactTag(null)).toBe(false);
    });
});

describe('castEnchantmentFromItem: artifact fixed cast level (Force spells only)', () => {
    let actor;

    function makeArtifactRobe({ tags = ["artifact"], castLevel = 30 } = {}) {
        return {
            system: {
                tags,
                magic: { enchantments: [{ usage: "passive", spellUuid: "Item.stun-relief" }], castLevel }
            },
            update: jest.fn().mockResolvedValue(undefined),
            delete: jest.fn().mockResolvedValue(undefined)
        };
    }

    beforeEach(() => {
        actor = makeActor();
        global.foundry.utils.duplicate = (obj) => JSON.parse(JSON.stringify(obj));
        global.fromUuid = jest.fn().mockResolvedValue({ type: "spell", system: { type: "F" } });
        ForceSpellService.castForceSpell = jest.fn().mockResolvedValue(true);
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('passes the item\'s castLevel as casterLevelOverride when tagged artifact', async () => {
        const item = makeArtifactRobe({ castLevel: 30 });

        await castEnchantmentFromItem(actor, item, 0);

        const call = ForceSpellService.castForceSpell.mock.calls[0][0];
        expect(call.casterLevelOverride).toBe(30);
    });

    test('does NOT apply castLevel when the item lacks the artifact tag, even if set', async () => {
        const item = makeArtifactRobe({ tags: [], castLevel: 30 });

        await castEnchantmentFromItem(actor, item, 0);

        const call = ForceSpellService.castForceSpell.mock.calls[0][0];
        expect(call.casterLevelOverride).toBe(0);
    });

    test('defaults to 0 (no override) when castLevel is unset on an artifact', async () => {
        const item = makeArtifactRobe({ castLevel: null });

        await castEnchantmentFromItem(actor, item, 0);

        const call = ForceSpellService.castForceSpell.mock.calls[0][0];
        expect(call.casterLevelOverride).toBe(0);
    });

    test('never passes a negative override', async () => {
        const item = makeArtifactRobe({ castLevel: -5 });

        await castEnchantmentFromItem(actor, item, 0);

        const call = ForceSpellService.castForceSpell.mock.calls[0][0];
        expect(call.casterLevelOverride).toBe(0);
    });
});
