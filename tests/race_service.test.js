/**
 * Tests for RaceService
 */
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
});
