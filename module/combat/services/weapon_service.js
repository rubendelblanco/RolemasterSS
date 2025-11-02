export class WeaponService {
    static getOffensiveBonus(actor, weapon) {
        const skillId = weapon.system.offensive_skill;
        const skill = actor.items.get(skillId);
        const baseOB = skill?.system.total_bonus ?? 0;
        return baseOB;
    };

    static getDefensiveBonus(actor);

    static getWeaponData(weapon);

    static getRangePenalty(distance);

    static getAttackTable(weapon);
}