/**
 * Tests for RaceService
 */
import { jest } from '@jest/globals';
import RaceService from '../module/actors/services/race_service.js';

describe('RaceService', () => {

    const createRaceItem = (ess = "", chan = "", ment = "", arcane = "") => ({
        system: {
            progression: {
                ess_dev: ess,
                chan_dev: chan,
                ment_dev: ment,
                arcane_dev: arcane
            }
        }
    });

    describe('computePPDevelopmentProgression', () => {

        describe('pure realms', () => {
            test('essence returns ess_dev progression', () => {
                const race = createRaceItem("0*7*6*5*4", "0*6*5*4*3", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "essence")).toBe("0*7*6*5*4");
            });

            test('channeling returns chan_dev progression', () => {
                const race = createRaceItem("", "0*6*5*4*3", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "channeling")).toBe("0*6*5*4*3");
            });

            test('mentalism returns ment_dev progression', () => {
                const race = createRaceItem("", "", "0*5*4*3*2", "");
                expect(RaceService.computePPDevelopmentProgression(race, "mentalism")).toBe("0*5*4*3*2");
            });

            test('arcane returns arcane_dev progression', () => {
                const race = createRaceItem("", "", "", "0*8*7*6*5");
                expect(RaceService.computePPDevelopmentProgression(race, "arcane")).toBe("0*8*7*6*5");
            });

            test('empty progression returns null for essence', () => {
                const race = createRaceItem("", "0*6*5*4*3", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "essence")).toBeNull();
            });

            test('realm is case-insensitive', () => {
                const race = createRaceItem("0*7*6*5*4", "", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "ESSENCE")).toBe("0*7*6*5*4");
            });
        });

        describe('hybrid realms', () => {
            test('essence/channeling returns progression with higher second number', () => {
                const race = createRaceItem("0*7*6*5*4", "0*6*5*4*3", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "essence/channeling")).toBe("0*7*6*5*4");
            });

            test('channeling/essence returns progression with higher second number', () => {
                const race = createRaceItem("0*6*5*4*3", "0*7*6*5*4", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "channeling/essence")).toBe("0*7*6*5*4");
            });

            test('channeling/essence when equal second number returns channeling (first in sorted pair)', () => {
                const race = createRaceItem("0*7*6*5*4", "0*7*5*4*3", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "essence/channeling")).toBe("0*7*5*4*3");
            });

            test('essence/mentalism compares ess vs ment', () => {
                const race = createRaceItem("0*5*4*3*2", "", "0*7*6*5*4", "");
                expect(RaceService.computePPDevelopmentProgression(race, "essence/mentalism")).toBe("0*7*6*5*4");
            });

            test('channeling/mentalism compares chan vs ment', () => {
                const race = createRaceItem("", "0*8*7*6*5", "0*6*5*4*3", "");
                expect(RaceService.computePPDevelopmentProgression(race, "channeling/mentalism")).toBe("0*8*7*6*5");
            });
        });

        describe('edge cases', () => {
            test('null realm returns null', () => {
                const race = createRaceItem("0*7*6*5*4", "", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, null)).toBeNull();
            });

            test('empty realm returns null', () => {
                const race = createRaceItem("0*7*6*5*4", "", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "")).toBeNull();
            });

            test('accepts progressions object directly (no system.progression)', () => {
                const progressions = { ess_dev: "0*7*6*5*4", chan_dev: "", ment_dev: "", arcane_dev: "" };
                expect(RaceService.computePPDevelopmentProgression(progressions, "essence")).toBe("0*7*6*5*4");
            });

            test('invalid hybrid (single realm) returns null', () => {
                const race = createRaceItem("0*7*6*5*4", "", "", "");
                expect(RaceService.computePPDevelopmentProgression(race, "essence/channeling/mentalism")).toBeNull();
            });
        });
    });

    describe('applyRace: resistance roll race mods', () => {
        const makeItemData = (rr_mods) => ({
            name: "Elf",
            system: {
                progression: {},
                stat_bonus: { ag: 0, co: 0, em: 0, in: 0, me: 0, pr: 0, qu: 0, re: 0, sd: 0, st: 0 },
                rr_mods
            }
        });

        const makeActor = () => ({
            system: { fixed_info: {} },
            update: jest.fn().mockResolvedValue(undefined)
        });

        test('writes the pure realms as-is', async () => {
            const actor = makeActor();
            await RaceService.applyRace(actor, makeItemData({ chan: 5, ess: 10, ment: 15, poison: 20, disease: 25 }));
            const updates = actor.update.mock.calls[0][0];
            expect(updates["system.resistance_rolls.channeling.race_mod"]).toBe(5);
            expect(updates["system.resistance_rolls.essence.race_mod"]).toBe(10);
            expect(updates["system.resistance_rolls.mentalism.race_mod"]).toBe(15);
            expect(updates["system.resistance_rolls.poison.race_mod"]).toBe(20);
            expect(updates["system.resistance_rolls.disease.race_mod"]).toBe(25);
        });

        test('writes the hybrid keys spelled exactly as the template schema (chann_ess, chann_ment, ess_ment)', async () => {
            const actor = makeActor();
            await RaceService.applyRace(actor, makeItemData({ chan: 5, ess: 10, ment: 15, poison: 0, disease: 0 }));
            const updates = actor.update.mock.calls[0][0];
            expect(updates["system.resistance_rolls.chann_ess.race_mod"]).toBe(15);
            expect(updates["system.resistance_rolls.chann_ment.race_mod"]).toBe(20);
            expect(updates["system.resistance_rolls.ess_ment.race_mod"]).toBe(25);
            expect("system.resistance_rolls.chann_es.race_mod" in updates).toBe(false);
        });

        test('arcane sums channeling + essence + mentalism, not channeling twice', async () => {
            const actor = makeActor();
            await RaceService.applyRace(actor, makeItemData({ chan: 5, ess: 10, ment: 15, poison: 0, disease: 0 }));
            const updates = actor.update.mock.calls[0][0];
            expect(updates["system.resistance_rolls.arcane.race_mod"]).toBe(30);
        });
    });
});
