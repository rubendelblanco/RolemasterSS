// RankCalculator.js
export default class RankCalculator {

    static increaseRanks(item, ranks) {
        const designation = item.system.designation;
        let base_ranks = item.system.ranks;
        let total_ranks = base_ranks + ranks;

        // Handle different designations
        if (designation === "Occupational") {
            total_ranks = base_ranks + (ranks*3);
        } else if (designation === "Everyman") {
            total_ranks = base_ranks + (ranks*2);
        }

        if (total_ranks < 0) total_ranks = 0; //just in case a miss calculation appears
        return total_ranks;
    }

    static calculateRanksBonus(item, total_ranks, progression_string) {
        let progression = progression_string
            .split('*')
            .map(num => parseFloat(num.trim()));
        const [initialBonus, multiplier1, multiplier2, multiplier3, multiplier4] = progression;
        let bonus;
        const designation = item.system.designation;
        total_ranks = parseInt(total_ranks); //force integer value

        item.update({ 'system.ranks': total_ranks });

        if (designation === "Restricted") {
            const restricted_ranks = parseInt(total_ranks/2);

            if (restricted_ranks === 0) {
                bonus = initialBonus;
            }
            else if (restricted_ranks >= 1 && restricted_ranks <= 5) {
                bonus = multiplier1 * restricted_ranks;
            }
            else if (restricted_ranks >= 6 && restricted_ranks <= 10) {
                bonus = (5 * multiplier1) + ((restricted_ranks - 5) * multiplier2);
            }
            else if (restricted_ranks >= 11 && restricted_ranks <= 15) {
                bonus = (5 * multiplier1) + (5 * multiplier2) + ((restricted_ranks - 10) * multiplier3);
            }
            else if (restricted_ranks > 15) {
                bonus = (5 * multiplier1) + (5 * multiplier2) + (5 * multiplier3) + ((restricted_ranks - 15) * multiplier4);
            }
        }

        else {
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
        }


        item.update({ 'system.rank_bonus': bonus });
        return bonus;
    }
}
