/**
 * Dialog to assign weapon preference order and development costs.
 * Uses costs from the actor's current profession (skillCategoryCosts).
 */
export default class WeaponPreferenceDialog extends Application {

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "weapon-preference-dialog",
            title: game.i18n.localize("rmss.weapon_preference.title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/weapon_preference_dialog.html",
            width: 420,
            height: "auto",
            classes: ["rmss", "weapon-preference-dialog"]
        });
    }

    /** Get profession costs for weapon categories from actor's current profession. Returns { slug -> cost }. */
    _getProfessionWeaponCosts() {
        const profession = this.actor.items.find(i => i.type === "profession");
        const costs = profession?.system?.skillCategoryCosts ?? {};
        const fallback = CONFIG.rmss.weapon_preference_costs || [];
        const slugs = CONFIG.rmss.weapon_category_slugs || [];
        const result = {};
        slugs.forEach((slug, idx) => {
            result[slug] = costs[slug] ?? fallback[idx] ?? "5";
        });
        return result;
    }

    getData() {
        const slugs = CONFIG.rmss.weapon_category_slugs || [];
        const costsBySlug = this._getProfessionWeaponCosts();

        const weaponItems = this.actor.items.filter(i =>
            i.type === "skill_category" && slugs.includes(i.system?.slug)
        );

        const ordered = slugs
            .map(slug => weaponItems.find(i => i.system?.slug === slug))
            .filter(Boolean);

        const rows = ordered.map((item) => ({
            item,
            slug: item.system.slug,
            name: game.i18n.localize(`rmss.skill_categories_names.${item.system.slug}`) || item.name,
            cost: costsBySlug[item.system.slug] ?? item.system?.development_cost ?? "5",
            position: 0
        }));

        return {
            rows,
            canReorder: rows.length > 1
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find(".weapon-pref-apply").click(ev => this._onApply(ev));
        html.find("[data-action='cancel']").click(() => this.close());
        html.find(".weapon-pref-move-up").click(ev => this._move(ev, -1));
        html.find(".weapon-pref-move-down").click(ev => this._move(ev, 1));
    }

    _move(ev, delta) {
        ev.preventDefault();
        const listEl = this.element?.[0]?.querySelector?.(".weapon-pref-list");
        if (!listEl) return;

        const rows = [...listEl.querySelectorAll(".weapon-pref-row")];
        const idx = parseInt(ev.currentTarget.dataset.idx, 10);
        const el = rows[idx];
        if (!el) return;

        const targetIdx = idx + delta;
        if (targetIdx < 0 || targetIdx >= rows.length) return;

        const targetEl = rows[targetIdx];
        if (delta < 0) {
            listEl.insertBefore(el, targetEl);
        } else {
            listEl.insertBefore(el, targetEl.nextSibling);
        }
        this._syncOrderFromDom(listEl);
        this._updateButtonIndices(listEl);
    }

    _updateButtonIndices(listEl) {
        listEl.querySelectorAll(".weapon-pref-row").forEach((row, idx) => {
            row.dataset.idx = String(idx);
            const upBtn = row.querySelector(".weapon-pref-move-up");
            const downBtn = row.querySelector(".weapon-pref-move-down");
            if (upBtn) upBtn.dataset.idx = String(idx);
            if (downBtn) downBtn.dataset.idx = String(idx);
        });
    }

    _syncOrderFromDom(listEl = null) {
        if (!listEl) listEl = this.element?.[0]?.querySelector?.(".weapon-pref-list");
        if (!listEl) return;
        const costsBySlug = this._getProfessionWeaponCosts();

        [...listEl.querySelectorAll(".weapon-pref-row")].forEach((row) => {
            const slug = row.dataset.slug;
            const costEl = row.querySelector(".weapon-pref-cost");
            if (costEl && slug) costEl.textContent = costsBySlug[slug] ?? "5";
        });
    }

    _onApply(ev) {
        ev.preventDefault();
        const list = this.element?.[0]?.querySelector?.(".weapon-pref-list");
        if (!list) return this.close();

        const costsBySlug = this._getProfessionWeaponCosts();
        const ordered = [...list.querySelectorAll("[data-slug]")].map(el => el.dataset.slug);

        const updates = ordered.map((slug) => {
            const item = this.actor.items.find(i =>
                i.type === "skill_category" && i.system?.slug === slug
            );
            if (!item) return null;
            const cost = costsBySlug[slug] ?? "5";
            return { item, cost };
        }).filter(Boolean);

        (async () => {
            for (const { item, cost } of updates) {
                if (item.system.development_cost !== cost) {
                    await item.update({ "system.development_cost": cost });
                }
            }
            ui.notifications.info(game.i18n.localize("rmss.weapon_preference.applied"));
            this.close();
        })();
    }
}
