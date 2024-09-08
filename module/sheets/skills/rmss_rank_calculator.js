// RankCalculator.js
export default class RankCalculator {

    static increaseRanks(item, ranks) {
        let total_ranks = item.system.ranks + ranks;
        item.update({ 'system.ranks': total_ranks });
        return total_ranks;
    }

    static calculateRanksBonus(item, total_ranks, progression_string) {
        let progression = progression_string
            .split('*')
            .map(num => parseFloat(num.trim()));
        const [initialBonus, multiplier1, multiplier2, multiplier3, multiplier4] = progression;
        let bonus = 0;

        if (total_ranks === 0) {
            bonus = initialBonus;
        } else if (total_ranks >= 1 && total_ranks <= 10) {
            bonus = multiplier1 * total_ranks;
        } else if (total_ranks >= 11 && total_ranks <= 20) {
            bonus = (10 * multiplier1) + ((total_ranks - 10) * multiplier2);
        } else if (total_ranks >= 21 && total_ranks <= 30) {
            bonus = (10 * multiplier1) + (10 * multiplier2) + ((total_ranks - 20) * multiplier3);
        } else if (total_ranks > 30) {
            bonus = (10 * multiplier1) + (10 * multiplier2) + (10 * multiplier3) + ((total_ranks - 30) * multiplier4);
        }

        item.update({ 'system.rank_bonus': bonus });
        return bonus;
    }
}
