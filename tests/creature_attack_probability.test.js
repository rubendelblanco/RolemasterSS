/**
 * @jest-environment node
 */
import CreatureAttackProbabilityService from "../module/combat/services/creature_attack_probability_service.js";

function makeAttack(name, order, probability) {
    return { type: "creature_attack", name, system: { order, probability } };
}

describe("CreatureAttackProbabilityService.rollAttackChoice", () => {
    test("returns null when the actor has no creature_attack items", async () => {
        const actor = { items: [] };
        expect(await CreatureAttackProbabilityService.rollAttackChoice(actor)).toBeNull();
    });

    test("a single attack is returned directly without rolling", async () => {
        const bite = makeAttack("Bite", 1, 100);
        const actor = { items: [bite] };
        const choice = await CreatureAttackProbabilityService.rollAttackChoice(actor);
        expect(choice.attack).toBe(bite);
        expect(choice.roll).toBeNull();
    });

    // Global Roll mock (tests/setup.js) always resolves total: 50, so cumulative probability
    // ranges are deterministic here: whichever attack's cumulative sum first reaches >= 50 wins.
    test("picks the first attack whose cumulative range covers the roll (roll=50, Bite 70/Claw 30)", async () => {
        const bite = makeAttack("Bite", 1, 70);
        const claw = makeAttack("Claw", 2, 30);
        const actor = { items: [bite, claw] };
        const choice = await CreatureAttackProbabilityService.rollAttackChoice(actor);
        expect(choice.attack).toBe(bite);
    });

    test("picks the second attack when the roll lands past the first attack's range (roll=50, Bite 30/Claw 70)", async () => {
        const bite = makeAttack("Bite", 1, 30);
        const claw = makeAttack("Claw", 2, 70);
        const actor = { items: [bite, claw] };
        const choice = await CreatureAttackProbabilityService.rollAttackChoice(actor);
        expect(choice.attack).toBe(claw);
    });

    test("respects system.order rather than array order", async () => {
        const claw = makeAttack("Claw", 2, 70);
        const bite = makeAttack("Bite", 1, 30);
        const actor = { items: [claw, bite] }; // array order reversed vs. system.order
        const choice = await CreatureAttackProbabilityService.rollAttackChoice(actor);
        expect(choice.attack).toBe(claw); // Bite (30) covers 1-30, Claw (70) covers 31-100 - roll 50 -> Claw
    });

    test("falls back to the last attack when probabilities don't sum to 100 and the roll exceeds them all", async () => {
        const bite = makeAttack("Bite", 1, 20);
        const claw = makeAttack("Claw", 2, 20);
        const actor = { items: [bite, claw] }; // cumulative only reaches 40, roll is 50
        const choice = await CreatureAttackProbabilityService.rollAttackChoice(actor);
        expect(choice.attack).toBe(claw);
    });

    test("ignores non-creature_attack items", async () => {
        const bite = makeAttack("Bite", 1, 100);
        const weapon = { type: "weapon", name: "Sword", system: { order: 0, probability: 100 } };
        const actor = { items: [weapon, bite] };
        const choice = await CreatureAttackProbabilityService.rollAttackChoice(actor);
        expect(choice.attack).toBe(bite);
        expect(choice.roll).toBeNull();
    });
});
