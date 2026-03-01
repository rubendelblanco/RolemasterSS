/**
 * Sheet for editing profession items. Handles description, skill category costs,
 * prime stats, spell user type, and profession bonuses (skills/categories with numeric bonuses).
 */
export default class RMSSProfessionSheet extends ItemSheet {

    /** @returns {Object} Sheet dimensions, template path, and tab configuration. */
    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 620,
            height: 700,
            template: "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html",
            classes: ["rmss", "sheet", "profession"],
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "description" }],
        });
    }

    /** @returns {string} Path to the HTML template. */
    get template() {
        return "systems/rmss/templates/sheets/professions/rmss-profession-sheet.html";
    }

    /**
     * Prepares data for the template: skill categories with costs, prime stats selects,
     * profession bonuses, and spell user type options.
     * @returns {Promise<Object>} Sheet data for rendering.
     */
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

    /**
     * Builds the skill categories list for the Costs tab: each category gets its localized name,
     * slug, and development cost from the profession. Sorted alphabetically by name.
     * @param {Object} costs - Stored costs keyed by category slug (system.skillCategoryCosts).
     * @param {Object} categoriesConfig - CONFIG.rmss.skill_categories.
     * @returns {Array<{slug: string, name: string, cost: string|number}>}
     */
    _buildSkillCategories(costs, categoriesConfig) {
        return Object.entries(categoriesConfig)
            .map(([slug, data]) => ({
                slug,
                name: game.i18n.localize(`rmss.skill_categories_names.${slug}`) || data.name,
                cost: costs[slug] ?? ""
            }))
            .sort((a, b) => a.name.localeCompare(b.name));
    }

    /**
     * Builds the four prime stats dropdowns. Each select excludes stats already chosen in the others
     * to avoid duplicates. Includes an empty "---" option for unset slots.
     * @param {string[]} primeStats - Current selections (e.g. ["agility", "constitution", "", ""]).
     * @param {Object} statsConfig - CONFIG.rmss.stats.
     * @returns {Array<{options: Array<{key: string, label: string, selected: boolean}>}>}
     */
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

    /**
     * Binds event handlers: drop zone for adding bonuses, remove button, and bonus value input.
     * @param {jQuery} html - The rendered sheet HTML.
     */
    activateListeners(html) {
        super.activateListeners(html);
        this._setupBonusDropZone(html);
        html.find(".profession-bonus-remove").click(ev => this._onRemoveBonus(ev));
        html.find(".profession-bonus-value").on("change", ev => this._onBonusValueChange(ev));
    }

    /**
     * Updates the numeric bonus value when the user changes the input for a profession bonus.
     * @param {Event} ev - Change event on the bonus value input.
     */
    async _onBonusValueChange(ev) {
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const val = parseInt(ev.currentTarget.value, 10) || 0;
        const bonuses = [...(this.item.system.professionBonuses ?? [])];
        if (idx < 0 || idx >= bonuses.length) return;
        bonuses[idx] = { ...bonuses[idx], bonus: val };
        await this.item.update({ "system.professionBonuses": bonuses });
    }

    /**
     * Enables drag-and-drop on the profession bonuses zone. Accepts skills and skill categories
     * dragged from the character sheet or item directory.
     * @param {jQuery} html - The rendered sheet HTML.
     */
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

    /**
     * Handles dropping a skill or skill category onto the bonuses zone. Extracts slug from the
     * dropped item, adds it to professionBonuses with default bonus 5, and prevents duplicates.
     * @param {DragEvent} event - The drop event.
     */
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

    /**
     * Removes a profession bonus from the list when the user clicks the trash button.
     * @param {Event} ev - Click event on the remove button.
     */
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
