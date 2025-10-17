// module/actors/drop_handlers/skill_drop_handler.js
import SkillService from "../services/skill_service.js";

export default class SkillDropHandler {
    constructor(actor) {
        this.actor = actor;
    }

    async handle(itemData) {
        return SkillService.createSkill(this.actor, itemData);
    }
}