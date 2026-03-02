/**
 * Sheet for editing race items. Handles stat bonuses, rr_mods, progression,
 * languages (communication skills), and skill designations.
 */
export default class RMSSRaceSheet extends ItemSheet {

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            width: 560,
            height: 520,
            template: "systems/rmss/templates/sheets/races/rmss-race-sheet.html",
            classes: ["rmss", "sheet", "race"],
            tabs: [{ navSelector: ".sheet-tabs", contentSelector: ".sheet-body", initial: "general" }],
        });
    }

    get template() {
        return "systems/rmss/templates/sheets/races/rmss-race-sheet.html";
    }

    async getData() {
        const baseData = await super.getData();
        const system = baseData.item.system;

        const languages = (system.languages ?? []).map((entry, idx) => ({
            ...entry,
            idx,
            displayName: entry.slug ?? entry.name ?? "?"
        }));

        const skillDesignations = (system.skillDesignations ?? []).map((sd, idx) => ({
            ...sd,
            idx,
            displayName: sd.slug,
            designationLabel: game.i18n.localize(`rmss.skill_designations.${sd.designation}`) || sd.designation
        }));

        const hobbySkills = (system.hobby_skills ?? []).map((entry, idx) => ({
            ...entry,
            idx,
            displayName: entry.slug ?? entry.name ?? "?"
        }));

        return {
            owner: this.item.isOwner,
            editable: this.isEditable,
            item: baseData.item,
            system,
            hobbySkills,
            languages,
            skillDesignations,
            config: CONFIG.rmss
        };
    }

    activateListeners(html) {
        super.activateListeners(html);
        this._setupHobbySkillsDropZone(html);
        this._setupLanguagesDropZone(html);
        this._setupSkillDesignationDropZone(html);
        html.find(".race-hobby-skill-remove").click(ev => this._onRemoveHobbySkill(ev));
        html.find(".race-language-remove").click(ev => this._onRemoveLanguage(ev));
        html.find(".race-skill-designation-remove").click(ev => this._onRemoveSkillDesignation(ev));
    }

    _setupHobbySkillsDropZone(html) {
        const zone = html.find(".race-hobby-skills-drop-zone")[0];
        if (!zone) return;

        zone.addEventListener("dragover", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.dropEffect = "copy";
        });
        zone.addEventListener("drop", ev => this._onDropHobbySkill(ev));
    }

    async _onDropHobbySkill(event) {
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
            ui.notifications.warn(game.i18n.localize("rmss.race.hobby_skill_only"));
            return;
        }

        const slug = dropped.name;
        const hobbySkills = [...(this.item.system.hobby_skills ?? [])];
        if (hobbySkills.some(h => (h.slug ?? h.name) === slug)) {
            ui.notifications.warn(game.i18n.localize("rmss.race.hobby_skill_already_added"));
            return;
        }

        hobbySkills.push({ slug });
        await this.item.update({ "system.hobby_skills": hobbySkills });
        this.render(false);
    }

    async _onRemoveHobbySkill(ev) {
        ev.preventDefault();
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const hobbySkills = [...(this.item.system.hobby_skills ?? [])];
        if (idx < 0 || idx >= hobbySkills.length) return;
        hobbySkills.splice(idx, 1);
        await this.item.update({ "system.hobby_skills": hobbySkills });
        this.render(false);
    }

    _setupLanguagesDropZone(html) {
        const zone = html.find(".race-languages-drop-zone")[0];
        if (!zone) return;

        zone.addEventListener("dragover", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.dropEffect = "copy";
        });
        zone.addEventListener("drop", ev => this._onDropLanguage(ev));
    }

    _setupSkillDesignationDropZone(html) {
        const zone = html.find(".race-skill-designations-drop-zone")[0];
        if (!zone) return;

        zone.addEventListener("dragover", ev => {
            ev.preventDefault();
            ev.stopPropagation();
            ev.dataTransfer.dropEffect = "copy";
        });
        zone.addEventListener("drop", ev => this._onDropSkillDesignation(ev));
    }

    async _onDropLanguage(event) {
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
            ui.notifications.warn(game.i18n.localize("rmss.race.languages_only_communication"));
            return;
        }

        const categorySlug = dropped.system?.categorySlug ?? "";
        if (categorySlug !== "communications") {
            ui.notifications.warn(game.i18n.localize("rmss.race.languages_only_communication"));
            return;
        }

        const slug = dropped.name;
        const languages = [...(this.item.system.languages ?? [])];
        if (languages.some(l => (l.slug ?? l.name) === slug)) {
            ui.notifications.warn(game.i18n.localize("rmss.race.language_already_added"));
            return;
        }

        languages.push({ slug });
        await this.item.update({ "system.languages": languages });
        this.render(false);
    }

    async _onRemoveLanguage(ev) {
        ev.preventDefault();
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const languages = [...(this.item.system.languages ?? [])];
        if (idx < 0 || idx >= languages.length) return;
        languages.splice(idx, 1);
        await this.item.update({ "system.languages": languages });
        this.render(false);
    }

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
            ui.notifications.warn(game.i18n.localize("rmss.race.designation_skill_only"));
            return;
        }

        const slug = dropped.name;
        const designations = [...(this.item.system.skillDesignations ?? [])];
        if (designations.some(d => d.slug === slug)) {
            ui.notifications.warn(game.i18n.localize("rmss.race.designation_already_added"));
            return;
        }

        const designation = await this._showDesignationDialog(slug);
        if (!designation) return;

        designations.push({ slug, designation });
        await this.item.update({ "system.skillDesignations": designations });
        this.render(false);
    }

    async _showDesignationDialog(skillName) {
        const designations = ["Everyman", "Occupational", "Restricted"];
        const options = designations.map(d => ({
            value: d,
            label: game.i18n.localize(`rmss.skill_designations.${d}`) || d
        }));

        return new Promise((resolve) => {
            new Dialog({
                title: game.i18n.localize("rmss.race.select_designation_title"),
                content: `
                    <form>
                        <p>${game.i18n.format("rmss.race.select_designation_content", { skill: skillName })}</p>
                        <div class="form-group">
                            <label>${game.i18n.localize("rmss.race.designation")}</label>
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
