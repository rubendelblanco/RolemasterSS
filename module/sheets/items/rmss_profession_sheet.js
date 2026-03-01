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

        const skillDesignations = (system.skillDesignations ?? []).map((sd, idx) => ({
            ...sd,
            idx,
            displayName: sd.slug,
            designationLabel: game.i18n.localize(`rmss.skill_designations.${sd.designation}`) || sd.designation
        }));

        const basicSpellLists = (system.basicSpellLists ?? []).map((entry, idx) => ({
            ...entry,
            idx,
            name: entry.name ?? entry.uuid ?? "?"
        }));

        const sheetData = {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system,
            professionBonuses,
            skillDesignations,
            basicSpellLists,
            config: {
                ...config,
                spellUserTypes: {
                    none: game.i18n.localize("rmss.profession.spell_user_none"),
                    semi: game.i18n.localize("rmss.profession.spell_user_semi"),
                    pure: game.i18n.localize("rmss.profession.spell_user_pure"),
                    hybrid: game.i18n.localize("rmss.profession.spell_user_hybrid"),
                    arcane_pure: game.i18n.localize("rmss.profession.spell_user_arcane_pure"),
                    arcane_semi: game.i18n.localize("rmss.profession.spell_user_arcane_semi")
                },
                spellRealmOptions: {
                    essence: game.i18n.localize("rmss.race.resistances.essence") || "Essence",
                    channeling: game.i18n.localize("rmss.race.resistances.channeling") || "Channeling",
                    mentalism: game.i18n.localize("rmss.race.resistances.mentalism") || "Mentalism"
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
        this._setupSkillDesignationDropZone(html);
        this._setupBasicSpellListsDropZone(html);
        this._setupSpellUserTypeAndRealmListeners(html);
        html.find(".profession-bonus-remove").click(ev => this._onRemoveBonus(ev));
        html.find(".profession-basic-spell-list-remove").click(ev => this._onRemoveBasicSpellList(ev));
        html.find(".profession-bonus-value").on("change", ev => this._onBonusValueChange(ev));
        html.find(".profession-skill-designation-remove").click(ev => this._onRemoveSkillDesignation(ev));
    }

    /**
     * When spell user type or spell realm changes, auto-assign required prime stats for semi spell-users.
     * Essence -> empathy, Channeling -> intuition, Mentalism -> presence, Arcane -> all three.
     * @param {jQuery} html - The rendered sheet HTML.
     */
    _setupSpellUserTypeAndRealmListeners(html) {
        html.find(".profession-spell-user-type").on("change", ev => this._onSpellUserTypeOrRealmChange(ev));
        html.find(".profession-spell-realm").on("change", ev => this._onSpellUserTypeOrRealmChange(ev));
    }

    /**
     * Handles spell user type or realm change. For semi + realm, auto-assigns required prime stats to empty slots.
     * Stops propagation to prevent Foundry's form submit from overwriting our calculated primeStats.
     */
    async _onSpellUserTypeOrRealmChange(ev) {
        ev.stopImmediatePropagation();
        const form = ev.currentTarget?.form;
        if (!form) return;

        const spellUserType = form.querySelector("[name='system.spellUserType']")?.value ?? this.item.system.spellUserType;
        const spellRealm = form.querySelector("[name='system.spellRealm']")?.value ?? this.item.system.spellRealm;

        const update = { "system.spellUserType": spellUserType };
        if (spellUserType === "semi" || spellUserType === "pure" || spellUserType === "hybrid") {
            update["system.spellRealm"] = spellRealm || "";
        } else {
            update["system.spellRealm"] = "";
        }

        const raw = this.item.system.primeStats ?? ["", "", "", ""];
        let primeStats = Array.isArray(raw)
            ? [...raw]
            : [0, 1, 2, 3].map(i => raw?.[i] ?? "");
        while (primeStats.length < 4) primeStats.push("");

        const arcaneStats = ["empathy", "intuition", "presence"];
        let requiredStats = [];
        if ((spellUserType === "semi" || spellUserType === "pure") && spellRealm) {
            requiredStats = this._getRequiredStatsForRealm(spellRealm);
        } else if (spellUserType === "hybrid" && spellRealm) {
            requiredStats = this._getRequiredStatsForRealmHybrid(spellRealm);
        } else if (spellUserType === "arcane_pure" || spellUserType === "arcane_semi") {
            requiredStats = arcaneStats;
        }

        if (requiredStats.length > 0) {
            let slotIdx = 0;
            for (const stat of requiredStats) {
                if (primeStats.includes(stat)) continue;
                while (slotIdx < 4 && primeStats[slotIdx]) slotIdx++;
                if (slotIdx >= 4) break;
                primeStats[slotIdx] = stat;
                slotIdx++;
            }
        }

        update["system.primeStats"] = primeStats;
        await this.item.update(update);
        this.render(false);
    }

    /**
     * Returns the prime stats required for a spell realm (semi/pure: one stat).
     * @param {string} realm - essence, channeling, mentalism, or arcane
     * @returns {string[]}
     */
    _getRequiredStatsForRealm(realm) {
        const r = (realm || "").toLowerCase();
        if (r === "essence") return ["empathy"];
        if (r === "channeling") return ["intuition"];
        if (r === "mentalism") return ["presence"];
        if (r === "arcane") return ["empathy", "intuition", "presence"];
        return [];
    }

    /**
     * Returns the two prime stats required for a hybrid spell user by realm.
     * @param {string} realm - essence, channeling, or mentalism
     * @returns {string[]}
     */
    _getRequiredStatsForRealmHybrid(realm) {
        const r = (realm || "").toLowerCase();
        if (r === "essence") return ["empathy", "intuition"];
        if (r === "channeling") return ["intuition", "presence"];
        if (r === "mentalism") return ["presence", "empathy"];
        return [];
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

    /**
     * Sets up the drop zone for skill designations (Everyman, Occupational, Restricted).
     * @param {jQuery} html - The rendered sheet HTML.
     */
    _setupSkillDesignationDropZone(html) {
        const zone = html.find(".profession-skill-designations-drop-zone")[0];
        if (!zone) return;

        zone.addEventListener("dragover", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.dropEffect = "copy";
        });
        zone.addEventListener("drop", ev => this._onDropSkillDesignation(ev));
    }

    /**
     * Sets up the drop zone for basic spell lists (spell lists from compendium).
     * @param {jQuery} html - The rendered sheet HTML.
     */
    _setupBasicSpellListsDropZone(html) {
        const zone = html.find(".profession-basic-spell-lists-drop-zone")[0];
        if (!zone) return;

        zone.addEventListener("dragover", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.dropEffect = "copy";
        });
        zone.addEventListener("drop", ev => this._onDropBasicSpellList(ev));
    }

    /**
     * Handles dropping a spell list onto the basic spell lists zone. Accepts spell lists from compendium.
     * @param {DragEvent} event - The drop event.
     */
    async _onDropBasicSpellList(event) {
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

        if (dropped.type !== "spell_list") {
            ui.notifications.warn(game.i18n.localize("rmss.profession.basic_spell_list_only"));
            return;
        }

        const uuid = dropped.uuid ?? data.uuid;
        const name = dropped.name ?? "?";
        const lists = [...(this.item.system.basicSpellLists ?? [])];
        if (lists.some(l => l.uuid === uuid)) {
            ui.notifications.warn(game.i18n.localize("rmss.profession.basic_spell_list_already_added"));
            return;
        }

        lists.push({ uuid, name });
        await this.item.update({ "system.basicSpellLists": lists });
        this.render(false);
    }

    /**
     * Removes a basic spell list from the profession.
     * @param {Event} ev - Click event on the remove button.
     */
    async _onRemoveBasicSpellList(ev) {
        ev.preventDefault();
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const lists = [...(this.item.system.basicSpellLists ?? [])];
        if (idx < 0 || idx >= lists.length) return;
        lists.splice(idx, 1);
        await this.item.update({ "system.basicSpellLists": lists });
        this.render(false);
    }

    /**
     * Handles dropping a skill onto the designations zone. Shows a modal to pick designation
     * (Everyman, Occupational, Restricted) and adds it to skillDesignations.
     * @param {DragEvent} event - The drop event.
     */
    async _onDropSkillDesignation(event) {
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

        if (dropped.type !== "skill") {
            ui.notifications.warn(game.i18n.localize("rmss.profession.designation_skill_only"));
            return;
        }

        const slug = dropped.name;
        const designations = [...(this.item.system.skillDesignations ?? [])];
        if (designations.some(d => d.slug === slug)) {
            ui.notifications.warn(game.i18n.localize("rmss.profession.designation_already_added"));
            return;
        }

        const designation = await this._showDesignationDialog(slug);
        if (!designation) return;

        designations.push({ slug, designation });
        await this.item.update({ "system.skillDesignations": designations });
        this.render(false);
    }

    /**
     * Shows a dialog to select designation (Everyman, Occupational, Restricted).
     * @param {string} skillName - Name of the skill being configured.
     * @returns {Promise<string|null>} Selected designation or null if cancelled.
     */
    async _showDesignationDialog(skillName) {
        const designations = ["Everyman", "Occupational", "Restricted"];
        const options = designations.map(d => ({
            value: d,
            label: game.i18n.localize(`rmss.skill_designations.${d}`) || d
        }));

        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.profession.select_designation_title"),
                content: `
                    <form>
                        <p>${game.i18n.format("rmss.profession.select_designation_content", { skill: skillName })}</p>
                        <div class="form-group">
                            <label>${game.i18n.localize("rmss.profession.designation")}</label>
                            <select name="designation">
                                ${options.map(o => `<option value="${o.value}">${o.label}</option>`).join("")}
                            </select>
                        </div>
                    </form>
                `,
                buttons: {
                    ok: {
                        icon: "<i class='fas fa-check'></i>",
                        label: game.i18n.localize("OK"),
                        callback: (html) => resolve(html.find("[name=designation]").val())
                    },
                    cancel: {
                        icon: "<i class='fas fa-times'></i>",
                        label: game.i18n.localize("Cancel"),
                        callback: () => resolve(null)
                    }
                },
                default: "ok"
            }).render(true);
        });
    }

    /**
     * Removes a skill designation from the list.
     * @param {Event} ev - Click event on the remove button.
     */
    async _onRemoveSkillDesignation(ev) {
        ev.preventDefault();
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const designations = [...(this.item.system.skillDesignations ?? [])];
        if (idx < 0 || idx >= designations.length) return;
        designations.splice(idx, 1);
        await this.item.update({ "system.skillDesignations": designations });
        this.render(false);
    }
}
