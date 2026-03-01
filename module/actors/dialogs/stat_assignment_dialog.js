/**
 * Dialog for assigning stat points at character creation (level 0).
 * T-1.2: 600 + 10d10 or fixed 660 points. Prime stats min 90, others min 20.
 * Formula: points ≤ 90 → stat = points; points > 90 → stat = 90 + floor(sqrt(points - 90)).
 */
import StatService from "../services/stat_service.js";

export default class StatAssignmentDialog extends Application {

    static STAT_KEYS = ["agility", "constitution", "memory", "reasoning", "self_discipline", "empathy", "intuition", "presence", "quickness", "strength"];

    constructor(actor, options = {}) {
        super(options);
        this.actor = actor;
        this.totalPoints = actor.system?.statAssignment?.totalPoints ?? null;
        const saved = actor.system?.statAssignment?.pointsAssigned ?? {};
        const profession = actor.items?.find(i => i.type === "profession");
        const primeStats = StatAssignmentDialog._normalizePrimeStats(profession?.system?.primeStats);
        this.pointsAssigned = {};
        for (const key of StatAssignmentDialog.STAT_KEYS) {
            this.pointsAssigned[key] = saved[key] ?? (primeStats.includes(key) ? 90 : 20);
        }
    }

    static get defaultOptions() {
        return foundry.utils.mergeObject(super.defaultOptions, {
            id: "stat-assignment-dialog",
            title: game.i18n.localize("rmss.stat_assignment.title"),
            template: "systems/rmss/templates/sheets/actors/dialogs/stat_assignment_dialog.html",
            width: 420,
            height: "auto",
            classes: ["rmss", "stat-assignment-dialog"]
        });
    }

    /** Points → stat value. T-1.2: ≤90 → points; >90 → 90 + floor(sqrt(points-90)). */
    static pointsToStat(points) {
        const p = Number(points) || 0;
        if (p <= 90) return Math.max(0, Math.min(90, Math.round(p)));
        return 90 + Math.floor(Math.sqrt(p - 90));
    }

    /** Normalize primeStats to array of stat keys (handles object form from Foundry forms). */
    static _normalizePrimeStats(raw) {
        if (!raw) return [];
        if (Array.isArray(raw)) return raw.filter(Boolean);
        return Object.values(raw).filter(Boolean);
    }

    _getPrimeStats() {
        const profession = this.actor.items.find(i => i.type === "profession");
        const primeStats = StatAssignmentDialog._normalizePrimeStats(profession?.system?.primeStats);
        return StatAssignmentDialog.STAT_KEYS.filter(k => primeStats.includes(k));
    }

    getData() {
        const primeStats = this._getPrimeStats();
        const totalPoints = this.totalPoints ?? 0;

        const rows = StatAssignmentDialog.STAT_KEYS.map(key => {
            const isPrime = primeStats.includes(key);
            const minPoints = isPrime ? 90 : 20;
            const points = this.pointsAssigned[key] ?? minPoints;
            const statValue = StatAssignmentDialog.pointsToStat(points);

            return {
                key,
                label: game.i18n.localize(`rmss.player_character.attribute.${key}`) || CONFIG.rmss?.stats?.[key]?.fullname || key,
                points,
                statValue,
                minPoints,
                isPrime
            };
        });

        const used = Object.values(this.pointsAssigned).reduce((s, v) => s + (Number(v) || 0), 0);
        const remaining = (totalPoints || 0) - used;

        return {
            rows,
            totalPoints: totalPoints || null,
            used,
            remaining
        };
    }

    activateListeners(html) {
        super.activateListeners(html);

        html.find(".stat-assignment-roll-10d10").click(ev => this._onRoll10d10(ev));
        html.find(".stat-assignment-take-660").click(ev => this._onTake660(ev));
        html.find(".stat-assignment-apply").click(ev => this._onApply(ev));
        html.find("[data-action='cancel']").click(() => this.close());
        html.find(".stat-assignment-points").on("input", ev => this._onPointsChange(ev));
        html.find(".stat-assignment-points").on("blur", ev => this._onPointsBlur(ev));
    }

    async _onRoll10d10(ev) {
        ev.preventDefault();
        const roll = await new Roll("10d10").evaluate();
        this.totalPoints = 600 + roll.total;
        await roll.toMessage();
        this.render();
    }

    _onTake660(ev) {
        ev.preventDefault();
        this.totalPoints = 660;
        this.render();
    }

    _getMaxForStat(stat) {
        const sumOthers = Object.entries(this.pointsAssigned)
            .filter(([k]) => k !== stat)
            .reduce((s, [, v]) => s + (Number(v) || 0), 0);
        return Math.max(0, (this.totalPoints || 0) - sumOthers);
    }

    _clampPointValue(stat, val) {
        const primeStats = this._getPrimeStats();
        const min = primeStats.includes(stat) ? 90 : 20;
        const max = this._getMaxForStat(stat);
        return Math.min(Math.max(val, min), max);
    }

    _onPointsChange(ev) {
        const input = ev.currentTarget;
        const stat = input.dataset.stat;
        let val = parseInt(input.value, 10);
        if (isNaN(val)) val = 0;
        val = this._clampPointValue(stat, val);
        this.pointsAssigned[stat] = val;
        if (Number(input.value) !== val) input.value = val;
        this._updateSummary();
    }

    _onPointsBlur(ev) {
        const input = ev.currentTarget;
        const stat = input.dataset.stat;
        const primeStats = this._getPrimeStats();
        const min = primeStats.includes(stat) ? 90 : 20;
        let val = parseInt(input.value, 10);
        if (isNaN(val) || val < min) {
            val = this._clampPointValue(stat, min);
            input.value = val;
            this.pointsAssigned[stat] = val;
            this._updateSummary();
        } else {
            const max = this._getMaxForStat(stat);
            if (val > max) {
                val = max;
                input.value = val;
                this.pointsAssigned[stat] = val;
                this._updateSummary();
            }
        }
    }

    _updateSummary() {
        const root = this.element?.[0];
        const inputs = root?.querySelectorAll?.(".stat-assignment-points");
        if (inputs) {
            inputs.forEach(inp => {
                const stat = inp.dataset.stat;
                let pts = parseInt(inp.value, 10);
                if (stat && !isNaN(pts)) {
                    pts = this._clampPointValue(stat, pts);
                    if (Number(inp.value) !== pts) inp.value = pts;
                    this.pointsAssigned[stat] = pts;
                }
            });
        }
        const total = Object.values(this.pointsAssigned).reduce((s, v) => s + (Number(v) || 0), 0);
        const remaining = (this.totalPoints || 0) - total;

        const usedEl = root?.querySelector?.("#stat-assignment-used") ?? document.getElementById("stat-assignment-used");
        const remEl = root?.querySelector?.("#stat-assignment-remaining") ?? document.getElementById("stat-assignment-remaining");
        const errEl = root?.querySelector?.("#stat-assignment-errors") ?? document.getElementById("stat-assignment-errors");
        if (usedEl) usedEl.textContent = total;
        if (remEl) {
            remEl.textContent = remaining;
            remEl.classList.toggle("stat-assignment-over", remaining < 0);
        }

        inputs?.forEach(inp => {
            const stat = inp.dataset.stat;
            const pts = Number(this.pointsAssigned[stat]) || parseInt(inp.value, 10) || 0;
            const valSpan = inp.closest(".stat-assignment-row")?.querySelector(".stat-assignment-value");
            if (valSpan) valSpan.textContent = StatAssignmentDialog.pointsToStat(pts);
        });

        const errors = this._validate();
        if (errEl) errEl.innerHTML = errors.length ? `<p class="error">${errors.join("<br>")}</p>` : "";
        const applyBtn = root?.querySelector?.(".stat-assignment-apply") ?? document.querySelector(".stat-assignment-dialog .stat-assignment-apply");
        if (applyBtn) applyBtn.disabled = errors.length > 0;
    }

    _validate() {
        const errors = [];
        const primeStats = this._getPrimeStats();
        const total = Object.values(this.pointsAssigned).reduce((s, v) => s + (Number(v) || 0), 0);
        const available = this.totalPoints || 0;

        for (const key of StatAssignmentDialog.STAT_KEYS) {
            const pts = Number(this.pointsAssigned[key]) || 0;
            const min = primeStats.includes(key) ? 90 : 20;
            if (pts < min) {
                const label = game.i18n.localize(`rmss.player_character.attribute.${key}`) || key;
                errors.push(game.i18n.format("rmss.stat_assignment.min_points", { stat: label, min }));
            }
        }
        if (total !== available) {
            errors.push(game.i18n.format("rmss.stat_assignment.total_mismatch", { used: total, available }));
        }
        return errors;
    }

    async _onApply(ev) {
        ev.preventDefault();
        const errors = this._validate();
        if (errors.length > 0) {
            ui.notifications.warn(errors[0]);
            return;
        }

        const statsToRoll = {};
        for (const key of StatAssignmentDialog.STAT_KEYS) {
            const pts = Number(this.pointsAssigned[key]) || 0;
            const statValue = StatAssignmentDialog.pointsToStat(pts);
            statsToRoll[key] = statValue;
        }
        const potentials = await StatService.rollAllPotentialsFromTemps(statsToRoll, this.actor);

        const updates = {};
        for (const key of StatAssignmentDialog.STAT_KEYS) {
            updates[`system.stats.${key}.temp`] = statsToRoll[key];
            updates[`system.stats.${key}.potential`] = potentials[key];
        }
        updates["system.statAssignment"] = {
            totalPoints: this.totalPoints,
            pointsAssigned: { ...this.pointsAssigned },
            completed: true
        };

        await this.actor.update(updates);
        ui.notifications.info(game.i18n.localize("rmss.stat_assignment.applied"));
        this.close();
    }

    render(force = false, options = {}) {
        return super.render(force, options).then(() => {
            if (this.totalPoints) {
                requestAnimationFrame(() => this._updateSummary());
            }
            return this;
        });
    }
}
