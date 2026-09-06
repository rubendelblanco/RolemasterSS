import { findAmmoStacksOnActor, findAmmoStacksForWeapon, pickMissileAmmoForAttack } from "../module/actors/utils/ammunition_util.js";

function mockItem(id, tags, qty) {
    return {
        id,
        system: { tags, quantity: qty }
    };
}

function mockActor(items) {
    return { items };
}

describe("ammunition_util", () => {
    test("findAmmoStacksOnActor matches tag and qty", () => {
        const actor = mockActor([
            mockItem("a", ["arrow"], 5),
            mockItem("b", ["bolt"], 2),
            mockItem("c", ["arrow"], 0)
        ]);
        const stacks = findAmmoStacksOnActor(actor, "arrow");
        expect(stacks.map((i) => i.id)).toEqual(["a"]);
    });

    test("findAmmoStacksOnActor is case-insensitive on tag", () => {
        const actor = mockActor([mockItem("a", ["Arrow"], 1)]);
        expect(findAmmoStacksOnActor(actor, "arrow").length).toBe(1);
    });

    test("findAmmoStacksForWeapon uses weapon.system.ammoType", () => {
        const weapon = { system: { ammoType: "bolt", type: "mis" } };
        const actor = mockActor([weapon, mockItem("m", ["bolt"], 3)]);
        const stacks = findAmmoStacksForWeapon(actor, weapon);
        expect(stacks.map((i) => i.id)).toEqual(["m"]);
    });

    test("findAmmoStacksForWeapon empty ammoType returns []", () => {
        const weapon = { system: { ammoType: "", type: "mis" } };
        const actor = mockActor([weapon, mockItem("m", ["arrow"], 3)]);
        expect(findAmmoStacksForWeapon(actor, weapon).length).toBe(0);
    });

    describe("pickMissileAmmoForAttack short-circuits", () => {
        test("non-weapon item type: ok, no ammoItem, no dialog", async () => {
            const actor = mockActor([]);
            const item = { type: "skill", system: { type: "mis", ammoType: "arrow" } };
            await expect(pickMissileAmmoForAttack(actor, item)).resolves.toEqual({ ok: true, ammoItem: null });
        });

        test("non-missile weapon (melee): ok, no ammoItem, no dialog", async () => {
            const actor = mockActor([]);
            const weapon = { type: "weapon", system: { type: "melee", ammoType: "" } };
            await expect(pickMissileAmmoForAttack(actor, weapon)).resolves.toEqual({ ok: true, ammoItem: null });
        });

        test("missile weapon with no ammoType configured: ok, no ammoItem, no dialog", async () => {
            const actor = mockActor([]);
            const weapon = { type: "weapon", system: { type: "mis", ammoType: "" } };
            await expect(pickMissileAmmoForAttack(actor, weapon)).resolves.toEqual({ ok: true, ammoItem: null });
        });
    });
});
