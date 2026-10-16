import { RULES_SKILLS_SETTING, RULES_SKILL_DEFS } from "./rules_skills.js";

const { ApplicationV2, HandlebarsApplicationMixin } = foundry.applications.api;

/**
 * Settings menu "Skills with a rules function": one dropdown per function, filled with the catalog's skills
 * (the world's skill items), the ones in the function's usual category first.
 */
export class RulesSkillsMenu extends HandlebarsApplicationMixin(ApplicationV2) {
    static DEFAULT_OPTIONS = {
        id: "rmss-rules-skills-menu",
        tag: "form",
        classes: ["rmss"],
        window: {
            contentClasses: ["standard-form"],
            title: "rmss.rules_skills.menu_title",
            icon: "fa-solid fa-link"
        },
        position: { width: 520 },
        form: { closeOnSubmit: true, handler: RulesSkillsMenu.#onSubmit }
    };

    static PARTS = {
        body: { template: "systems/rmss/templates/settings/rules-skills-menu.hbs" },
        footer: { template: "templates/generic/form-footer.hbs" }
    };

    async _prepareContext() {
        const chosen = game.settings.get("rmss", RULES_SKILLS_SETTING) ?? {};
        const catalog = game.items.filter((i) => i.type === "skill").sort((a, b) => a.name.localeCompare(b.name, game.i18n.lang));
        const roles = Object.entries(RULES_SKILL_DEFS).map(([role, def]) => {
            // Only the skills of the function's category: it is a fixed category, so the list is short and can't be got wrong
            const inCategory = catalog.filter((s) => s.system?.categorySlug === def.categorySlug);
            const option = (s) => ({ value: s.uuid, label: s.name });
            return {
                role,
                label: def.label,
                hint: def.hint,
                value: chosen[role]?.uuid ?? "",
                // A choice made earlier that is outside the category stays visible, so saving doesn't silently drop it
                options: [...inCategory, ...catalog.filter((s) => s.uuid === chosen[role]?.uuid && !inCategory.includes(s))].map(option),
                noneInCategory: inCategory.length === 0,
                // Keeps a choice whose catalog skill has been deleted visible, instead of silently showing "none"
                missing: !!chosen[role]?.uuid && !catalog.some((s) => s.uuid === chosen[role].uuid) ? chosen[role].name : null
            };
        });
        return {
            roles,
            buttons: [{ type: "submit", icon: "fa-solid fa-floppy-disk", label: "SETTINGS.Save" }]
        };
    }

    /** @this {RulesSkillsMenu} */
    static async #onSubmit(_event, _form, formData) {
        const previous = game.settings.get("rmss", RULES_SKILLS_SETTING) ?? {};
        const next = {};
        for (const role of Object.keys(RULES_SKILL_DEFS)) {
            const uuid = formData.object[role] ?? "";
            if (!uuid) continue;
            const skill = await fromUuid(uuid);
            if (skill) next[role] = { uuid, name: skill.name };
            else if (previous[role]?.uuid === uuid) next[role] = previous[role];
        }
        await game.settings.set("rmss", RULES_SKILLS_SETTING, next);
    }
}

/** Registers the setting and its menu. Called once, when the language is ready. */
export function registerRulesSkillsSettings() {
    game.settings.register("rmss", RULES_SKILLS_SETTING, {
        scope: "world",
        config: false,
        type: Object,
        default: {}
    });
    game.settings.registerMenu("rmss", RULES_SKILLS_SETTING, {
        name: game.i18n.localize("rmss.rules_skills.menu_name"),
        label: game.i18n.localize("rmss.rules_skills.menu_label"),
        hint: game.i18n.localize("rmss.rules_skills.menu_hint"),
        icon: "fa-solid fa-link",
        type: RulesSkillsMenu,
        restricted: true
    });
}
