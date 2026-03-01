export default class RMSSProfessionSheet extends ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 620,
            height: 700,
            template: "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html",
            classes: ["rmss", "sheet", "profession"],
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
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

        const professionBonuses = (system.professionBonuses ?? []).map((b, idx) => ({
            ...b,
            idx,
            displayName: b.type === "category"
                ? (game.i18n.localize(`rmss.skill_categories_names.${b.slug}`) || b.slug)
                : b.slug
        }));

        const sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system,
            professionBonuses,
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
        this._setupBonusDropZone(html);
        html.find(".profession-bonus-remove").click(ev => this._onRemoveBonus(ev));
        html.find(".profession-bonus-value").on("change", ev => this._onBonusValueChange(ev));
    }

    async _onBonusValueChange(ev) {
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const val = parseInt(ev.currentTarget.value, 10) || 0;
        const bonuses = [...(this.item.system.professionBonuses ?? [])];
        if (idx < 0 || idx >= bonuses.length) return;
        bonuses[idx] = { ...bonuses[idx], bonus: val };
        await this.item.update({ "system.professionBonuses": bonuses });
    }

    _setupBonusDropZone(html) {
        const zone = html.find(".profession-bonuses-drop-zone")[0];
        if (!zone) return;

        zone.addEventListener("dragover", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.dropEffect = "copy";
        });
        zone.addEventListener("drop", ev => this._onDropBonus(ev));
    }

    async _onDropBonus(event) {
        event.preventDefault();
        event.stopPropagation();
        let data;
        try {
            data = JSON.parse(event.dataTransfer.getData("text/plain"));
        } catch {
            return;
        }
        if (!data?.uuid) return;

        const dropped = await fromUuid(data.uuid);
        if (!dropped) return;

        if (dropped.type !== "skill_category" && dropped.type !== "skill") {
            ui.notifications.warn(game.i18n.localize("rmss.profession.bonus_drop_only"));
            return;
        }

        const slug = dropped.type === "skill_category"
            ? (dropped.system?.slug ?? Object.entries(CONFIG.rmss?.skill_categories || {}).find(([, d]) => d?.name === dropped.name)?.[0])
            : dropped.name;

        if (!slug) {
            ui.notifications.warn(game.i18n.localize("rmss.profession.bonus_slug_unknown"));
            return;
        }

        const bonuses = [...(this.item.system.professionBonuses ?? [])];
        if (bonuses.some(b => b.slug === slug && b.type === (dropped.type === "skill_category" ? "category" : "skill"))) {
            ui.notifications.warn(game.i18n.localize("rmss.profession.bonus_already_added"));
            return;
        }

        bonuses.push({
            slug,
            bonus: 5,
            type: dropped.type === "skill_category" ? "category" : "skill"
        });
        await this.item.update({ "system.professionBonuses": bonuses });
        this.render(false);
    }

    async _onRemoveBonus(ev) {
        ev.preventDefault();
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const bonuses = [...(this.item.system.professionBonuses ?? [])];
        if (idx < 0 || idx >= bonuses.length) return;
        bonuses.splice(idx, 1);
        await this.item.update({ "system.professionBonuses": bonuses });
        this.render(false);
    }
}
