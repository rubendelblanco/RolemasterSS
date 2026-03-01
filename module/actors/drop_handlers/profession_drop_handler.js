// module/actors/drop_handlers/profession_drop_handler.js
import ProfessionService from "../services/profession_service.js";

export default class ProfessionDropHandler {
    constructor(actor) {
        this.actor = actor;
    }

    async handle(itemData, event, data) {
        const level = Number(this.actor.system?.attributes?.level?.value ?? 0);
        if (level > 0) {
            ui.notifications.warn(game.i18n.localize("rmss.profession.drop_only_level_zero"));
            return;
        }

        const existingProfession = this.actor.items.find(i => i.type === "profession");
        if (existingProfession) {
            const confirmed = await Dialog.confirm({
                title: game.i18n.localize("rmss.profession.replace_confirm_title"),
                content: game.i18n.format("rmss.profession.replace_confirm_content", {
                    current: existingProfession.name,
                    incoming: itemData.name
                }),
                defaultYes: false
            });
            if (!confirmed) return;
        }

        return ProfessionService.applyProfession(this.actor, itemData);
    }
}
