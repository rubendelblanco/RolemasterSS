/**
 * Whisper recipients for the creature-attack chain reminder: GMs plus any player who owns the
 * attacking actor (e.g. a druid controlling an animal companion) - see
 * postCreatureAttackSpecialChainGmReminder in rmss_weapon_critical_manager.js.
 */
import { jest } from '@jest/globals';
import { RMSSWeaponCriticalManager } from '../module/combat/rmss_weapon_critical_manager.js';
import Utils from '../module/utils.js';

function makeAttack(id, order, special) {
    return { id, type: "creature_attack", name: `Attack ${order}`, system: { order, special } };
}

function makeAttacker({ items, ownerUserIds = [] }) {
    items.get = (id) => items.find((i) => i.id === id);
    return {
        name: "Bear",
        items,
        testUserPermission: (user) => ownerUserIds.includes(user.id)
    };
}

describe('postCreatureAttackSpecialChainGmReminder whisper recipients', () => {
    const gm = { id: "gm1", isGM: true };
    const owner = { id: "player1", isGM: false };
    const bystander = { id: "player2", isGM: false };

    beforeEach(() => {
        global.game.i18n.format = (key) => key;
        global.game.users = [gm, owner, bystander];
        ChatMessage.create.mockClear();
    });

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test('whispers GM + the owning player when a chained follow-up attack is armed', async () => {
        const attack1 = makeAttack("a1", 1, "none");
        const attack2 = makeAttack("a2", 2, "same");
        const attacker = makeAttacker({ items: [attack1, attack2], ownerUserIds: [owner.id] });
        Utils.getActor = jest.fn().mockReturnValue(attacker);

        await RMSSWeaponCriticalManager.postCreatureAttackSpecialChainGmReminder({
            attackerId: "actor1",
            weaponItemId: "a1",
            severity: "A",
            critType: "large_melee"
        });

        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        const whisper = ChatMessage.create.mock.calls[0][0].whisper;
        expect(new Set(whisper)).toEqual(new Set([gm.id, owner.id]));
        expect(whisper).not.toContain(bystander.id);
    });

    test('GM-only when nobody owns the actor', async () => {
        const attack1 = makeAttack("a1", 1, "none");
        const attack2 = makeAttack("a2", 2, "next");
        const attacker = makeAttacker({ items: [attack1, attack2], ownerUserIds: [] });
        Utils.getActor = jest.fn().mockReturnValue(attacker);

        await RMSSWeaponCriticalManager.postCreatureAttackSpecialChainGmReminder({
            attackerId: "actor1",
            weaponItemId: "a1",
            severity: "B",
            critType: "large_melee"
        });

        expect(ChatMessage.create).toHaveBeenCalledTimes(1);
        expect(ChatMessage.create.mock.calls[0][0].whisper).toEqual([gm.id]);
    });

    test('no reminder sent when the follow-up attack is not special (none)', async () => {
        const attack1 = makeAttack("a1", 1, "none");
        const attack2 = makeAttack("a2", 2, "none");
        const attacker = makeAttacker({ items: [attack1, attack2], ownerUserIds: [owner.id] });
        Utils.getActor = jest.fn().mockReturnValue(attacker);

        await RMSSWeaponCriticalManager.postCreatureAttackSpecialChainGmReminder({
            attackerId: "actor1",
            weaponItemId: "a1",
            severity: "A",
            critType: "large_melee"
        });

        expect(ChatMessage.create).not.toHaveBeenCalled();
    });

    test('no reminder when the critical has no resolvable severity', async () => {
        const attack1 = makeAttack("a1", 1, "none");
        const attack2 = makeAttack("a2", 2, "same");
        const attacker = makeAttacker({ items: [attack1, attack2], ownerUserIds: [owner.id] });
        Utils.getActor = jest.fn().mockReturnValue(attacker);

        await RMSSWeaponCriticalManager.postCreatureAttackSpecialChainGmReminder({
            attackerId: "actor1",
            weaponItemId: "a1",
            severity: "null",
            critType: "large_melee"
        });

        expect(ChatMessage.create).not.toHaveBeenCalled();
    });
});
