export default class RMSSProfessionSheet extends ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 620,
            height: 700,
            template: "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html",
            classes: ["rmss", "sheet", "profession"],
        });
    }

    get template() {
        return "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html";
    }

    async getData() {
        const baseData = await super.getData();
        const system = baseData.item.system;
        const config = CONFIG.rmss;

        const skillCategories = this._buildSkillCategories(system.skillCategoryCosts || {}, config.skill_categories || {});
        const primeStatsRaw = system.primeStats ?? ["", "", "", ""];
        const primeStats = Array.isArray(primeStatsRaw)
            ? primeStatsRaw
            : [0, 1, 2, 3].map(i => primeStatsRaw?.[i] ?? "");
        const primeStatsSelects = this._buildPrimeStatsSelects(primeStats, config.stats || {});

        const sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system,
            config: {
                ...config,
                spellUserTypes: {
                    none: game.i18n.localize("rmss.profession.spell_user_none"),
                    semi: game.i18n.localize("rmss.profession.spell_user_semi"),
                    pure: game.i18n.localize("rmss.profession.spell_user_pure"),
                    hybrid: game.i18n.localize("rmss.profession.spell_user_hybrid"),
                    arcane_pure: game.i18n.localize("rmss.profession.spell_user_arcane_pure"),
                    arcane_semi: game.i18n.localize("rmss.profession.spell_user_arcane_semi")
                }
            },
            skillCategories,
            primeStatsSelects
        };

        return sheetData;
    }

    _buildSkillCategories(costs, categoriesConfig) {
        return Object.entries(categoriesConfig)
            .map(([slug, data]) => ({
                slug,
                name: game.i18n.localize(`rmss.skill_categories_names.${slug}`) || data.name,
                cost: costs[slug] ?? ""
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    _buildPrimeStatsSelects(primeStats, statsConfig) {
        const statKeys = Object.keys(statsConfig);
        return [0, 1, 2, 3].map(idx => {
            const selected = primeStats[idx] || "";
            const othersSelected = primeStats.filter((_, i) => i !== idx);
            const available = statKeys.filter(k => !othersSelected.includes(k));
            const options = [
                { key: "", label: "---", selected: !selected },
                ...available.map(k => ({
                    key: k,
                    label: statsConfig[k].fullname || k,
                    selected: k === selected
                }))
            ];
            return { options };
        });
    }

    activateListeners(html) {
        super.activateListeners(html);
    }
}
